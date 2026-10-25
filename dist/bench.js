import {analyzeCircuit,branchOrder} from './topology.js?v=2.6';
import {physicalBounds} from './physical.js?v=2.6';

const probe=t=>t.kind==='leaf'?t.component.type==='voltmeter':t.children.every(probe);
const control=t=>t.kind==='leaf'&&['ammeter','switch'].includes(t.component.type);
const loadCount=t=>t.kind==='leaf'?Number(!['ammeter','voltmeter','switch'].includes(t.component.type)):t.children.reduce((sum,c)=>sum+loadCount(c),0);
const fork=t=>t.kind==='parallel'&&t.children.filter(c=>!probe(c)).length>1;
const reversible=c=>['lamp','resistor','switch','heater','fuse','inductor','led'].includes(c.type);
const instrumentSide=(tree,port,fallback)=>tree.kind==='leaf'&&tree.component.type==='ammeter'?(port===1?-1:1):fallback;
const extent=parts=>{
  const boxes=parts.map(p=>physicalBounds({...p.component,...p}));
  return {left:Math.min(...boxes.map(b=>b.x)),right:Math.max(...boxes.map(b=>b.x+b.width)),top:Math.min(...boxes.map(b=>b.y)),bottom:Math.max(...boxes.map(b=>b.y+b.height))};
};
const move=(scene,x,y)=>scene.parts.map(p=>({...p,x:p.x+x,y:p.y+y}));
function nodeDistances(edges,start){const found=new Map([[start,0]]),queue=[start];for(const node of queue)for(const edge of edges){const next=edge.a===node?edge.b:edge.b===node?edge.a:null;if(next!==null&&!found.has(next)){found.set(next,found.get(node)+1);queue.push(next);}}return found;}

function selectorBench(cluster,nets){
  const selectors=cluster.edges.filter(e=>e.component.type==='spdt');if(cluster.edges.some(e=>e.multiport&&e.component.type!=='spdt'))return null;
  if(selectors.length===2){
    const source=cluster.source,first=selectors.find(e=>e.a===source.a||e.a===source.b),second=selectors.find(e=>e!==first);if(!first||!second)return null;
    const straight=[1,2].every(i=>nets.find(`${first.key}:${i}`)===nets.find(`${second.key}:${i}`)),crossed=[1,2].every(i=>nets.find(`${first.key}:${i}`)===nets.find(`${second.key}:${3-i}`));if(!straight&&!crossed)return null;
    const rest=cluster.edges.filter(e=>e!==source&&!selectors.includes(e)&&e.component.type!=='voltmeter'),distances=nodeDistances(rest,second.a),parts=[{component:first.component,x:0,y:0,angle:0,physicalFlip:false},{component:second.component,x:220,y:0,angle:crossed?180:0,physicalFlip:straight}];
    if(rest.some(e=>!distances.has(e.a)&&!distances.has(e.b)))return null;
    rest.sort((a,b)=>Math.min(distances.get(a.a)??Infinity,distances.get(a.b)??Infinity)-Math.min(distances.get(b.a)??Infinity,distances.get(b.b)??Infinity)||branchOrder(a,b));
    rest.forEach((edge,i)=>parts.push({component:edge.component,x:440+i*210,y:220,angle:0,physicalFlip:reversible(edge.component)&&(distances.get(edge.a)??Infinity)>(distances.get(edge.b)??Infinity)}));
    for(const meter of cluster.edges.filter(e=>e.component.type==='voltmeter')){const measured=rest.find(e=>[e.a,e.b].includes(meter.a)&&[e.a,e.b].includes(meter.b)),part=parts.find(p=>p.component===measured?.component)??parts[2];if(!part)return null;parts.push({component:meter.component,x:part.x,y:part.y-160,angle:0,physicalFlip:false});}
    return {parts,height:400,sourcePose:{x:-210,y:220}};
  }
  if(selectors.length!==1)return null;
  const selector=selectors[0],edges=cluster.edges.filter(e=>e!==selector&&e!==cluster.source&&e.component.type!=='voltmeter'),one=nodeDistances(edges,nets.find(`${selector.key}:1`)),two=nodeDistances(edges,nets.find(`${selector.key}:2`)),common=nodeDistances(edges,selector.a);
  const near=(distances,edge)=>Math.min(distances.get(edge.a)??Infinity,distances.get(edge.b)??Infinity),branches=[[],[]],prefix=[],returning=[],parts=[];
  for(const edge of edges){const a=near(one,edge),b=near(two,edge);if(!Number.isFinite(a)&&!Number.isFinite(b))prefix.push(edge);else if(a===b)returning.push(edge);else branches[a<b?0:1].push(edge);}
  if(branches.some(branch=>!branch.length))return null;
  const place=(edge,x,y,flip=false)=>parts.push({component:edge.component,x,y,angle:0,physicalFlip:reversible(edge.component)&&flip});
  branches.forEach((branch,index)=>{const distances=index?two:one;branch.sort((a,b)=>near(distances,a)-near(distances,b)||branchOrder(a,b));branch.forEach((edge,i)=>place(edge,220+i*210,index*180,(distances.get(edge.a)??Infinity)>(distances.get(edge.b)??Infinity)));});
  // The common input stays beside the supply; the two throws face their own
  // branch rows in the same upper/lower order as the physical switch contacts.
  const y=Math.max(360,extent(parts).bottom+150),sourceX=-(prefix.length+1)*210;place(selector,0,y);
  prefix.sort((a,b)=>near(common,b)-near(common,a)||branchOrder(a,b));prefix.forEach((edge,i)=>place(edge,sourceX+(i+1)*210,y,(common.get(edge.a)??Infinity)<(common.get(edge.b)??Infinity)));
  returning.sort((a,b)=>near(one,a)-near(one,b)||branchOrder(a,b));returning.forEach((edge,i)=>place(edge,sourceX-(returning.length-i)*210,y,(one.get(edge.a)??Infinity)>(one.get(edge.b)??Infinity)));
  for(const [i,meter] of cluster.edges.filter(e=>e.component.type==='voltmeter').entries()){
    const measured=edges.find(e=>[e.a,e.b].includes(meter.a)&&[e.a,e.b].includes(meter.b)),part=parts.find(p=>p.component===measured?.component)??parts.find(p=>p.component===branches[i%2][0].component);
    place(meter,part.x,part.y-160);
  }
  return {parts,height:y,sourcePose:{x:sourceX,y}};
}

/** The electrical block tree determines which items belong together, not their
 * screen positions. Equipment can sit beside its branch or shared junction;
 * cables are routed later, independently of schematic buses and coordinates. */
export function arrangeBench(state,{reverseBranches=false,spacing=1}={}){
  function build(tree){
    if(tree.kind==='leaf')return {parts:[{component:tree.component,x:0,y:0,angle:0,physicalFlip:reversible(tree.component)&&tree.ports[0]===1}],height:150};
    if(tree.kind==='parallel'){
      const loads=tree.children.filter(c=>!probe(c)).sort((a,b)=>loadCount(b)-loadCount(a)||branchOrder(a,b)),meters=tree.children.filter(probe).sort(branchOrder),parts=[];
      if(reverseBranches)loads.reverse();
      let height=0,bottom=-Infinity;
      for(const [index,child] of loads.entries()){
        const scene=build(child),bounds=extent(scene.parts),stagger=index>0&&loads[0].kind!=='leaf'&&child.kind==='leaf'?65:0;
        const y=index?Math.max(height,bottom+24-bounds.top):0;
        parts.push(...move(scene,stagger,y));bottom=Math.max(bottom,y+bounds.bottom);height=y+scene.height+30;
      }
      if(loads.length)height-=30;
      for(const [index,meter] of meters.entries()){
        const scene=build(meter),bounds=parts.length?extent(parts):{left:-60,right:60,top:0};
        parts.push(...move(scene,(bounds.left+bounds.right)/2+(index-(meters.length-1)/2)*160,bounds.top-150));
      }
      return {parts,height:height||150};
    }
    const group=tree.children.find(fork);
    if(group){
      const scene=build(group),parts=[...scene.parts],bounds=extent(parts),index=tree.children.indexOf(group),center=(scene.height-150)/2;
      for(const [defaultSide,children] of [[-1,tree.children.slice(0,index)],[1,tree.children.slice(index+1)]]){
        let edge=defaultSide<0?bounds.left-160:bounds.right+160;
        for(const [i,child] of children.entries()){
          const side=instrumentSide(child,child.ports?.[defaultSide<0?0:1],defaultSide),next=build(child),nextBounds=extent(next.parts);
          const column=side!==defaultSide?(side<0?bounds.left-160:bounds.right+160):edge;
          const x=control(child)?column:side<0?column-nextBounds.right:column-nextBounds.left;
          parts.push(...move(next,x,center-(next.height-150)/2+(i-(children.length-1)/2)*150));
          if(side===defaultSide)edge=side<0?x+nextBounds.left-100:x+nextBounds.right+100;
        }
      }
      return {parts,height:scene.height};
    }
    // Series equipment can form a loose workbench loop. Instruments and the
    // switch sit near the side/return, rather than extending a symbolic row.
    const loads=tree.children.filter(c=>!control(c)),parts=[],steps=loads.length?loads:tree.children;
    for(const [i,child] of steps.entries())parts.push(...move(build(child),(i-(steps.length-1)/2)*210,0));
    if(loads.length){
      const first=tree.children.indexOf(loads[0]),last=tree.children.indexOf(loads.at(-1));
      const before=tree.children.slice(0,first),after=tree.children.slice(last+1),bounds=extent(parts);
      for(const [defaultSide,items] of [[-1,before],[1,after]])for(const [i,item] of items.entries()){
        const side=instrumentSide(item,item.ports?.[defaultSide<0?0:1],defaultSide);parts.push(...move(build(item),side<0?bounds.left-150:bounds.right+150,85+i*145));
      }
      for(let i=first+1;i<last;i++)if(control(tree.children[i]))parts.push(...move(build(tree.children[i]),(i-(tree.children.length-1)/2)*170,115));
    }
    return {parts,height:150};
  }

  let top=90;const analysis=analyzeCircuit(state);
  for(const cluster of analysis.clusters){
    let scene;
    const tree=cluster.tree,bank=tree?.kind==='series'&&tree.children.filter(fork),row=bank?.length===1&&tree.children.filter(child=>child!==bank[0]);
    const selector=cluster.source&&selectorBench(cluster,analysis.nets);
    if(selector)scene=selector;
    else if(cluster.source&&row?.length&&row.every(child=>child.kind==='leaf'&&reversible(child.component))){
      // Follow the return path around the outside of the parallel bank. Its
      // series equipment and source share a lower row, in electrical order.
      // The path runs right to left here, so its terminal orientation must be
      // reversed relative to a branch running across the bank above it.
      scene=build(bank[0]);const index=tree.children.indexOf(bank[0]),before=tree.children.slice(0,index).reverse(),after=tree.children.slice(index+1).reverse(),y=extent(scene.parts).bottom+150,left=-(row.length)*105;
      const items=[...before,null,...after];
      items.forEach((child,i)=>{const x=left+i*210;if(!child){scene.sourcePose={x,y};return;}scene.parts.push({component:child.component,x,y,angle:0,physicalFlip:child.ports[0]===0});});
    }
    else if(tree&&!cluster.bridge)scene=build(tree);
    else{
      const parts=cluster.edges.filter(e=>e!==cluster.source).map((e,i,all)=>{
        const angle=Math.PI+i*Math.PI*1.6/Math.max(1,all.length),radius=Math.max(190,all.length*34);
        return {component:e.component,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,angle:0,physicalFlip:false};
      });
      scene={parts,height:parts.length?extent(parts).bottom+150:150};
    }
    if(cluster.source){
      const lower=scene.parts.length?extent(scene.parts).bottom:0,offset=scene.parts.length>3?65:0;
      scene.parts.push({component:cluster.source.component,x:scene.sourcePose?.x??offset,y:scene.sourcePose?.y??lower+165,angle:0,physicalFlip:false});
    }
    if(!scene.parts.length)continue;
    for(const p of scene.parts){p.x*=spacing;p.y*=spacing;}
    const bounds=extent(scene.parts),dx=90-bounds.left,dy=top-bounds.top;
    for(const p of scene.parts)Object.assign(p.component,{x:Math.round(p.x+dx),y:Math.round(p.y+dy),angle:p.angle,physicalFlip:p.physicalFlip});
    top+=bounds.bottom-bounds.top+150;
  }
}
