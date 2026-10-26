// Pointer capture keeps the same gesture across browsers and native WebViews.
export function bindLibraryDrag({library,board,scroller=library.parentElement,previewContent,toWorld,add,enabled=()=>true}){
  let gesture=null,scrollFrame=null;
  const win=library.ownerDocument.defaultView,doc=library.ownerDocument;
  const scale=()=>Number.parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--ui-scale'))||1;
  const scrollAxes=()=>{const style=win.getComputedStyle(scroller);return {x:/auto|scroll/.test(style.overflowX)&&scroller.scrollWidth>scroller.clientWidth+2,y:/auto|scroll/.test(style.overflowY)&&scroller.scrollHeight>scroller.clientHeight+2};};
  function stopScroll(){if(scrollFrame!==null)win.cancelAnimationFrame(scrollFrame);scrollFrame=null;}
  function coast(vx,vy){
    let previous=win.performance.now();
    const frame=now=>{const dt=Math.min(32,now-previous);previous=now;const x=scroller.scrollLeft,y=scroller.scrollTop;scroller.scrollLeft+=vx*dt;scroller.scrollTop+=vy*dt;vx=scroller.scrollLeft===x?0:vx*Math.exp(-dt/160);vy=scroller.scrollTop===y?0:vy*Math.exp(-dt/160);scrollFrame=Math.hypot(vx,vy)>.02?win.requestAnimationFrame(frame):null;};
    scrollFrame=win.requestAnimationFrame(frame);
  }
  const inside=(element,event)=>{const r=element.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<r.right&&event.clientY>=r.top&&event.clientY<r.bottom;};
  function cancel(){
    if(!gesture)return;
    const current=gesture;gesture=null;
    win.clearTimeout(current.timer);current.preview?.remove();current.card.classList.remove('is-dragging','is-drag-ready');current.card.removeAttribute('aria-grabbed');board.classList.remove('library-drop-target');
    if(library.hasPointerCapture(current.id))library.releasePointerCapture(current.id);
  }
  library.addEventListener('pointerdown',event=>{
    const card=event.target.closest('[data-add]');
    if(gesture){if(event.pointerId!==gesture.id)cancel();return;}
    if(!card||event.button!==0||event.isPrimary===false||!enabled())return;
    event.preventDefault();stopScroll();
    const axes=scrollAxes(),hold=event.pointerType==='touch'&&(axes.x||axes.y);
    if(!hold)card.focus({preventScroll:true});
    gesture={id:event.pointerId,type:card.dataset.add,card,x:event.clientX,y:event.clientY,moved:false,hold,ready:false,scrolling:false,axes,left:scroller.scrollLeft,top:scroller.scrollTop,lastTime:event.timeStamp,vx:0,vy:0};
    library.setPointerCapture(event.pointerId);
    if(hold){const current=gesture;current.timer=win.setTimeout(()=>{if(gesture!==current||current.scrolling||!enabled())return;current.ready=true;card.classList.add('is-drag-ready');card.setAttribute('aria-grabbed','true');},420);}
  });
  win.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    event.preventDefault();
    if(gesture.hold&&!gesture.ready){
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(!gesture.scrolling&&Math.hypot(dx,dy)<8)return;
      gesture.scrolling=true;win.clearTimeout(gesture.timer);
      const beforeX=scroller.scrollLeft,beforeY=scroller.scrollTop,dt=Math.max(8,event.timeStamp-gesture.lastTime),s=scale();
      if(gesture.axes.x)scroller.scrollLeft=gesture.left-dx/s;
      if(gesture.axes.y)scroller.scrollTop=gesture.top-dy/s;
      gesture.vx=Math.max(-2.5,Math.min(2.5,(scroller.scrollLeft-beforeX)/dt));gesture.vy=Math.max(-2.5,Math.min(2.5,(scroller.scrollTop-beforeY)/dt));gesture.lastTime=event.timeStamp;return;
    }
    if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<5)return;
    if(!gesture.moved){
      gesture.moved=true;gesture.card.classList.add('is-dragging');
      const preview=doc.createElement('div');preview.className='library-drag-preview';preview.setAttribute('aria-hidden','true');
      preview.innerHTML=previewContent(gesture.type);doc.body.append(preview);gesture.preview=preview;
    }
    const s=scale();gesture.preview.style.transform=`translate(${event.clientX/s}px,${event.clientY/s}px) translate(-50%,-50%)`;
    const valid=enabled()&&inside(board,event)&&doc.elementFromPoint(event.clientX,event.clientY)?.closest('#board')===board;
    gesture.preview.classList.toggle('can-drop',valid);board.classList.toggle('library-drop-target',valid);
  },{passive:false});
  win.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const current=gesture;
    const valid=enabled()&&!current.scrolling&&(current.moved
      ?inside(board,event)&&doc.elementFromPoint(event.clientX,event.clientY)?.closest('#board')===board
      :!current.ready&&inside(current.card,event));
    cancel();
    if(current.scrolling&&event.timeStamp-current.lastTime<90)coast(current.vx,current.vy);
    if(valid)add(current.type,current.moved?toWorld(event):undefined);
  });
  // Pointer taps are handled above; keyboard and programmatic clicks stay accessible.
  library.addEventListener('click',event=>{if(event.detail!==0){event.preventDefault();return;}const card=event.target.closest('[data-add]');if(card&&enabled())add(card.dataset.add);});
  library.addEventListener('dragstart',event=>event.preventDefault());
  library.addEventListener('contextmenu',event=>{if(event.target.closest('[data-add]'))event.preventDefault();});
  library.addEventListener('lostpointercapture',event=>{if(event.pointerId===gesture?.id)cancel();});
  win.addEventListener('pointercancel',event=>{if(event.pointerId===gesture?.id)cancel();});
  win.addEventListener('pointerdown',event=>{stopScroll();if(gesture&&event.pointerId!==gesture.id)cancel();},true);
  win.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
  win.addEventListener('blur',()=>{cancel();stopScroll();});
  win.addEventListener('pagehide',()=>{cancel();stopScroll();});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden){cancel();stopScroll();}});
  return {cancel:()=>{cancel();stopScroll();}};
}
