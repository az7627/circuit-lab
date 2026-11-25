const key=element=>element.dataset.wire??`${element.localName}:${element.classList[0]??''}`;

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
