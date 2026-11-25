import {simplifyTrace} from './wiring.js?v=wire-display-2';

const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const vector = (a,b) => ({x:b.x-a.x,y:b.y-a.y});
const dot = (a,b) => a.x*b.x+a.y*b.y;
const normalize = v => {
  const length=Math.hypot(v.x,v.y);
  return length ? {x:v.x/length,y:v.y/length} : v;
};
const translate = (p,v,length) => ({x:p.x+v.x*length,y:p.y+v.y*length});
const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const coords = p => `${p.x} ${p.y}`;
const tolerance = 1.65;
const flatness = .035;

export function straightWire(points) {
  return points.map((point,i)=>`${i?'L':'M'}${coords(point)}`).join('');
}

function cubicAt([a,b,c,d],t) {
  const u=1-t, aWeight=u*u*u, bWeight=3*u*u*t, cWeight=3*u*t*t, dWeight=t*t*t;
  return {
    x:aWeight*a.x+bWeight*b.x+cWeight*c.x+dWeight*d.x,
    y:aWeight*a.y+bWeight*b.y+cWeight*c.y+dWeight*d.y
  };
}

// Fit across samples instead of interpolating position and jitter at every sample.
// Cubic control distances are chosen by least squares with fixed end tangents.
function fitControls(samples,start,end,left,right,parameters,freeEnds) {
  const a=samples[start],d=samples[end],chord=distance(a,d);
  let aa=0,ab=0,bb=0;
  const ax={x:0,y:0},bx={x:0,y:0};
  for(let i=start+1;i<end;i++){
    const t=parameters[i-start],u=1-t, one=3*u*u*t,two=3*u*t*t;
    const base=mix(a,d,two+t*t*t), offset=vector(base,samples[i]);
    aa+=one*one;
    ab+=one*two;
    bb+=two*two;
    ax.x+=one*offset.x;ax.y+=one*offset.y;
    bx.x+=two*offset.x;bx.y+=two*offset.y;
  }
  const limit=chord*.49;
  const handle=length=>Number.isFinite(length)?Math.max(chord*.025,Math.min(limit,length)):chord/3;
  if(freeEnds&&aa*bb-ab*ab>1e-10){
    const determinant=aa*bb-ab*ab,axis=normalize(vector(a,d));
    const first={x:(ax.x*bb-bx.x*ab)/determinant,y:(ax.y*bb-bx.y*ab)/determinant};
    const second={x:(bx.x*aa-ax.x*ab)/determinant,y:(bx.y*aa-ax.y*ab)/determinant};
    const lengthA=dot(first,axis),lengthB=dot(second,axis);
    return [a,translate(translate(a,first,1),axis,handle(lengthA)-lengthA),
      translate(translate(d,second,1),axis,-handle(-lengthB)-lengthB),d];
  }
  ab*=-dot(left,right);
  const determinant=aa*bb-ab*ab;
  const source=dot(ax,left),target=-dot(bx,right);
  const alpha=(source*bb-target*ab)/determinant,beta=(aa*target-ab*source)/determinant;
  return [a,translate(a,left,handle(alpha)),translate(d,right,-handle(beta)),d];
}

function projectedParameter(first,second,target,length) {
  if(target<=0)return 0;
  if(target>=length)return 1;
  let lo=0,hi=1;
  for(let step=0;step<15;step++){
    const mid=(lo+hi)/2,u=1-mid;
    const projected=3*u*u*mid*first+3*u*mid*mid*second+mid*mid*mid*length;
    if(projected<target)lo=mid;
    else hi=mid;
  }
  return (lo+hi)/2;
}

function distanceFromSegment(point,a,b) {
  const chord=vector(a,b), offset=vector(a,point);
  const t=Math.max(0,Math.min(1,dot(offset,chord)/(dot(chord,chord)||1)));
  return distance(point,translate(a,chord,t));
}

function flatten(curve,out,depth=0) {
  const [a,b,c,d]=curve;
  if(depth===10||Math.max(distanceFromSegment(b,a,d),distanceFromSegment(c,a,d))<=flatness){
    out.push(d);
    return;
  }
  const ab=mix(a,b,.5),bc=mix(b,c,.5),cd=mix(c,d,.5);
  const first=mix(ab,bc,.5),last=mix(bc,cd,.5),mid=mix(first,last,.5);
  flatten([a,ab,first,mid],out,depth+1);
  flatten([mid,last,cd,d],out,depth+1);
}

function sampledTrace(points) {
  const samples=points.filter((point,i)=>!i||distance(point,points[i-1])>1e-7);
  const last=samples.length-1,lengths=[0];
  for(let i=1;i<=last;i++)lengths.push(lengths[i-1]+distance(samples[i-1],samples[i]));
  if(last<2||!Number.isFinite(lengths[last]))return null;

  function atLength(length,lo,hi) {
    while(hi-lo>1){
      const mid=(lo+hi)>>1;
      if(lengths[mid]<length)lo=mid;
      else hi=mid;
    }
    return mix(samples[lo],samples[hi],(length-lengths[lo])/(lengths[hi]-lengths[lo]));
  }

  // Identify deliberate bends on a simplified trace so pointer jitter cannot
  // turn each small change of heading into a corner.
  const coarse=simplifyTrace(samples,tolerance),corners=[0];
  let index=1;
  for(let i=1;i<coarse.length-1;i++){
    const corner=coarse[i];
    while(index<last&&(samples[index].x!==corner.x||samples[index].y!==corner.y))index++;
    if(index>=last)break;
    const incoming=normalize(vector(coarse[i-1],corner));
    const outgoing=normalize(vector(corner,coarse[i+1]));
    if(dot(incoming,outgoing)<=.5)corners.push(index);
    index++;
  }
  corners.push(last);
  return {samples,lengths,atLength,corners};
}

export function physicalWirePolyline(points) {
  const trace=points.length>=4&&sampledTrace(points);
  if(!trace)return {path:straightWire(points),points};
  const {samples,lengths,atLength,corners}=trace;
  const filtered=samples.slice();
  let changed=false;
  // Average nearby samples at equal arc-length offsets. The symmetric window
  // shrinks at corners and ends, and sparse routes keep their existing bends.
  for(let span=1;span<corners.length;span++){
    const start=corners[span-1],end=corners[span];
    for(let i=start+1;i<end;i++){
      const length=lengths[i];
      if(lengths[i+1]-length>6||length-lengths[i-1]>6)continue;
      const radius=Math.min(4,length-lengths[start],lengths[end]-length);
      let x=0,y=0;
      for(let offset=-3;offset<=3;offset++){
        const sample=atLength(length+radius*offset/3,start,end);
        x+=sample.x;
        y+=sample.y;
      }
      const mean={x:x/7,y:y/7},movement=distance(samples[i],mean);
      if(movement<=1e-7)continue;
      filtered[i]=mix(samples[i],mean,Math.min(1,1.3/movement));
      changed=true;
    }
  }
  const display=changed?filtered:points;
  return {path:straightWire(display),points:display};
}

export function physicalWireCurve(points) {
  const trace=points.length>=3&&sampledTrace(points);
  if(!trace)return {path:straightWire(points),points};
  const {samples,lengths,atLength,corners}=trace;

  function tangent(at,from,to) {
    const s=lengths[at],reach=12;
    return normalize(vector(
      atLength(Math.max(lengths[from],s-reach),from,to),
      atLength(Math.min(lengths[to],s+reach),from,to)
    ));
  }

  const flattened=[samples[0]];
  let path=`M${coords(samples[0])}`,curved=false;
  function fit(start,end,left,right,depth=0) {
    const a=samples[start],d=samples[end],chord=distance(a,d),axis=normalize(vector(a,d));
    if(end-start===1||lengths[end]-lengths[start]-chord<1e-7){
      path+=`L${coords(d)}`;
      flattened.push(d);
      return;
    }
    let split=(start+end)>>1;
    if(chord>1e-7&&dot(axis,left)>0&&dot(axis,right)>0){
      const span=lengths[end]-lengths[start];
      const parameters=lengths.slice(start,end+1).map(s=>(s-lengths[start])/span);
      // A monotone projection on the chord prevents an individual span from
      // folding back, and provides a stable parameter update for irregular input.
      const projected=samples.slice(start+1,end).map(p=>dot(vector(a,p),axis));
      let curve,error;
      for(let iteration=0;iteration<4;iteration++){
        curve=fitControls(samples,start,end,left,right,parameters,depth===0);
        const first=dot(vector(a,curve[1]),axis),second=dot(vector(a,curve[2]),axis);
        error=0;
        let furthest=0;
        for(let i=start+1;i<end;i++){
          const target=projected[i-start-1];
          const t=projectedParameter(first,second,target,chord);
          parameters[i-start]=t;
          const deviation=Math.max(distance(samples[i],cubicAt(curve,t)),furthest-target);
          if(deviation>error){error=deviation;split=i;}
          furthest=Math.max(furthest,target);
        }
        if(error<=tolerance)break;
      }
      if(error<=tolerance){
        path+=`C${coords(curve[1])} ${coords(curve[2])} ${coords(d)}`;
        flatten(curve,flattened);
        curved=true;
        return;
      }
    }
    // Bound the recursion even for near-degenerate or very long drawn paths.
    if(depth>=8)split=(start+end)>>1;
    const center=tangent(split,start,end);
    fit(start,split,left,center,depth+1);
    fit(split,end,center,right,depth+1);
  }

  for(let i=1;i<corners.length;i++){
    const start=corners[i-1],end=corners[i];
    fit(start,end,tangent(start,start,end),tangent(end,start,end));
  }
  return curved?{path,points:flattened}:{path:straightWire(points),points};
}
