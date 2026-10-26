// Pointer capture keeps the same gesture across browsers and native WebViews.
export function bindLibraryDrag({library,board,previewContent,toWorld,add,enabled=()=>true}){
  let gesture=null;
  const win=library.ownerDocument.defaultView,doc=library.ownerDocument;
  const inside=(element,event)=>{const r=element.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<r.right&&event.clientY>=r.top&&event.clientY<r.bottom;};
  function cancel(){
    if(!gesture)return;
    const current=gesture;gesture=null;
    current.preview?.remove();current.card.classList.remove('is-dragging');board.classList.remove('library-drop-target');
    if(library.hasPointerCapture(current.id))library.releasePointerCapture(current.id);
  }
  library.addEventListener('pointerdown',event=>{
    const card=event.target.closest('[data-add]');
    if(gesture){if(event.pointerId!==gesture.id)cancel();return;}
    if(!card||event.button!==0||event.isPrimary===false||!enabled())return;
    event.preventDefault();card.focus({preventScroll:true});
    gesture={id:event.pointerId,type:card.dataset.add,card,x:event.clientX,y:event.clientY,moved:false};
    library.setPointerCapture(event.pointerId);
  });
  win.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    event.preventDefault();
    if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<5)return;
    if(!gesture.moved){
      gesture.moved=true;gesture.card.classList.add('is-dragging');
      const preview=doc.createElement('div');preview.className='library-drag-preview';preview.setAttribute('aria-hidden','true');
      preview.innerHTML=previewContent(gesture.type);doc.body.append(preview);gesture.preview=preview;
    }
    gesture.preview.style.transform=`translate(${event.clientX}px,${event.clientY}px) translate(-50%,-50%)`;
    const valid=enabled()&&inside(board,event)&&doc.elementFromPoint(event.clientX,event.clientY)?.closest('#board')===board;
    gesture.preview.classList.toggle('can-drop',valid);board.classList.toggle('library-drop-target',valid);
  },{passive:false});
  win.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const current=gesture;
    const valid=enabled()&&(current.moved
      ?inside(board,event)&&doc.elementFromPoint(event.clientX,event.clientY)?.closest('#board')===board
      :inside(current.card,event));
    cancel();
    if(valid)add(current.type,current.moved?toWorld(event):undefined);
  });
  // Pointer taps are handled above; keyboard and programmatic clicks stay accessible.
  library.addEventListener('click',event=>{if(event.detail!==0){event.preventDefault();return;}const card=event.target.closest('[data-add]');if(card&&enabled())add(card.dataset.add);});
  library.addEventListener('dragstart',event=>event.preventDefault());
  library.addEventListener('contextmenu',event=>{if(event.target.closest('[data-add]'))event.preventDefault();});
  library.addEventListener('lostpointercapture',event=>{if(event.pointerId===gesture?.id)cancel();});
  win.addEventListener('pointercancel',event=>{if(event.pointerId===gesture?.id)cancel();});
  win.addEventListener('pointerdown',event=>{if(gesture&&event.pointerId!==gesture.id)cancel();},true);
  win.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
  win.addEventListener('blur',cancel);
  win.addEventListener('pagehide',cancel);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();});
  return {cancel};
}
