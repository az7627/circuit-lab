import assert from 'node:assert/strict';
import {test} from 'node:test';
import {worldAt,zoomView,startPinch,movePinch} from '../dist/camera.js';

const viewport={left:180,top:100,width:900,height:600};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);

test('zoom keeps the point under the cursor fixed, including the zoom limits',()=>{
  const view={x:-4000,y:7000,zoom:.8},point={x:412,y:321},anchor=worldAt(view,point,viewport);
  for(const value of [.001,.05,.4,1,5,20]){
    const next=zoomView(view,value,viewport,point),result=worldAt(next,point,viewport);
    close(result.x,anchor.x);close(result.y,anchor.y);assert.ok(next.zoom>=.05&&next.zoom<=5);
  }
});

test('two fingers scale and pan together without moving their world anchor',()=>{
  const view={x:420,y:255,zoom:1.2},points=[{x:300,y:250},{x:500,y:250}],pinch=startPinch(view,points,viewport);
  const moved=[{x:260,y:300},{x:660,y:300}],next=movePinch(pinch,moved,viewport),anchor=worldAt(next,{x:460,y:300},viewport);
  close(next.zoom,2.4);close(anchor.x,pinch.anchor.x);close(anchor.y,pinch.anchor.y);
  const unchanged=movePinch(pinch,points,viewport);close(unchanged.x,view.x);close(unchanged.y,view.y);close(unchanged.zoom,view.zoom);
});

test('pinching at a zoom limit continues to follow finger translation',()=>{
  const view={x:0,y:0,zoom:4},pinch=startPinch(view,[{x:300,y:200},{x:400,y:200}],viewport);
  const next=movePinch(pinch,[{x:200,y:350},{x:600,y:350}],viewport),anchor=worldAt(next,{x:400,y:350},viewport);
  assert.equal(next.zoom,5);close(anchor.x,pinch.anchor.x);close(anchor.y,pinch.anchor.y);
});
