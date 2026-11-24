const key=element=>element.dataset.wire??`${element.localName}:${element.classList[0]??''}`;

export function wirePath(points, physical) {
  if (!points.length) return '';
  const coords = point => `${point.x} ${point.y}`;
  let path = `M${coords(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i-1], corner = points[i], after = points[i+1];
    const left = Math.hypot(before.x-corner.x, before.y-corner.y);
    const right = Math.hypot(after.x-corner.x, after.y-corner.y);
    if (!physical || !left || !right) {
      path += `L${coords(corner)}`;
      continue;
    }
    const ux = (before.x-corner.x)/left, uy = (before.y-corner.y)/left;
    const vx = (after.x-corner.x)/right, vy = (after.y-corner.y)/right;
    const turn = Math.hypot(ux+vx, uy+vy)/2;
    if (turn < 1e-6 || turn > .999) {
      path += `L${coords(corner)}`;
      continue;
    }
    // Keep the rounded display within 0.6 board units of the saved corner.
    const cut = Math.min(12, left/2, right/2, 1.2/turn);
    path += `L${corner.x+ux*cut} ${corner.y+uy*cut}Q${coords(corner)} ${corner.x+vx*cut} ${corner.y+vy*cut}`;
  }
  if (points.length > 1) path += `L${coords(points.at(-1))}`;
  return path;
}

function patch(parent,source){
  const wanted=[...source.children],keys=new Set(wanted.map(key)),available=new Map();
  for(const child of [...parent.children]){
    const id=key(child);
    if(!keys.has(id)){child.remove();continue;}
    if(!available.has(id))available.set(id,[]);
    available.get(id).push(child);
  }
  let cursor=parent.firstElementChild;
  for(const next of wanted){
    const current=available.get(key(next))?.shift()??next;
    if(current!==next){
      for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
      for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
      if(current.childElementCount||next.childElementCount)patch(current,next);
    }
    if(current!==cursor)parent.insertBefore(current,cursor);
    cursor=current.nextElementSibling;
  }
  for(const children of available.values())for(const child of children)child.remove();
}

// Reuse each wire and flow path. Replacing the SVG would restart its CSS animation
// on every slider input and on each capacitor/motor simulation tick.
export function renderWireLayer(layer,markup){
  const source=layer.cloneNode(false);source.innerHTML=markup;
  patch(layer,source);
}
