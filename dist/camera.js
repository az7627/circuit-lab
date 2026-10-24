import {viewportGeometry} from './visuals.js?v=2.6';

export const clampZoom=value=>Math.max(.05,Math.min(5,value));

export function worldAt(view,point,viewport){
  const {scale}=viewportGeometry(view,view.zoom,viewport);
  return {x:view.x+(point.x-viewport.left-viewport.width/2)/scale,y:view.y+(point.y-viewport.top-viewport.height/2)/scale};
}

export function anchorView(anchor,point,value,viewport){
  const zoom=clampZoom(value),{scale}=viewportGeometry(anchor,zoom,viewport);
  return {x:anchor.x-(point.x-viewport.left-viewport.width/2)/scale,y:anchor.y-(point.y-viewport.top-viewport.height/2)/scale,zoom};
}

export function zoomView(view,value,viewport,point=null){
  return point?anchorView(worldAt(view,point,viewport),point,value,viewport):{...view,zoom:clampZoom(value)};
}

const midpoint=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
const distance=points=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);

export function startPinch(view,points,viewport){
  return {anchor:worldAt(view,midpoint(points),viewport),distance:Math.max(1,distance(points)),zoom:view.zoom};
}

export function movePinch(pinch,points,viewport){
  return anchorView(pinch.anchor,midpoint(points),pinch.zoom*distance(points)/pinch.distance,viewport);
}
