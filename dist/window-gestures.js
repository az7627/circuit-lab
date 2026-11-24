export const resizeDirections = ['n','ne','e','se','s','sw','w','nw'];

export function draggedBounds(bounds, direction, dx, dy) {
  const {x,y,width,height,minWidth,minHeight} = bounds;
  if (direction === 'move') return {x:x+dx,y:y+dy,width,height};
  const west = direction.includes('w'), north = direction.includes('n');
  const nextWidth = Math.max(minWidth,width+(west?-dx:direction.includes('e')?dx:0));
  const nextHeight = Math.max(minHeight,height+(north?-dy:direction.includes('s')?dy:0));
  return {
    x:west?x+width-nextWidth:x,
    y:north?y+height-nextHeight:y,
    width:nextWidth,
    height:nextHeight
  };
}

export function bindWindowGestures(caption, handles, invoke) {
  let drag;

  function queueUpdate(current) {
    if (drag!==current || current.cancelled || !current.bounds || current.frame || current.pending) return;
    const dx=Math.round(current.dx), dy=Math.round(current.dy);
    if (dx===current.appliedX && dy===current.appliedY) return;
    current.frame=requestAnimationFrame(async()=>{
      current.frame=0;
      if (drag!==current || current.cancelled) return;
      current.pending=true;
      current.appliedX=Math.round(current.dx);
      current.appliedY=Math.round(current.dy);
      try {
        await invoke('desktop_window_drag_apply',{
          ...draggedBounds(current.bounds,current.direction,current.appliedX,current.appliedY),
          moving:current.direction==='move'
        });
      } catch {
        current.cancelled=true;
      } finally {
        current.pending=false;
        queueUpdate(current);
      }
    });
  }

  async function begin(current) {
    const moving=current.direction==='move';
    try {
      const original=await invoke('desktop_window_drag_start',{moving});
      if (drag!==current || current.cancelled) return;
      let bounds=original;
      if (original.maximized) {
        await invoke('desktop_window_action',{action:'restore'});
        for (let attempt=0;attempt<25 && bounds.maximized;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,20));
          if (drag!==current || current.cancelled) return;
          bounds=await invoke('desktop_window_drag_start',{moving});
        }
        if (bounds.maximized) return;
        bounds={
          ...bounds,
          x:original.x+Math.round((original.width-bounds.width)*current.anchor),
          y:original.y
        };
      }
      current.bounds=bounds;
      queueUpdate(current);
    } catch {
      current.cancelled=true;
    }
  }

  function move(event) {
    const current=drag;
    if (!current || current.finished || event.pointerId!==current.id) return;
    const dpi=window.devicePixelRatio;
    // WebView2 can change its CSS screen coordinates when a window crosses a
    // monitor boundary. Start a new offset at that point instead of jumping.
    if (dpi===current.dpi) {
      current.dx+=(event.screenX-current.screenX)*dpi;
      current.dy+=(event.screenY-current.screenY)*dpi;
    }
    Object.assign(current,{dpi,screenX:event.screenX,screenY:event.screenY});
    if (!current.started && Math.hypot(current.dx,current.dy)>=4*dpi) {
      current.started=true;
      void begin(current);
    }
    queueUpdate(current);
  }

  function finish(event) {
    if (!drag || drag.finished || event.pointerId!==drag.id) return;
    // A release can be reported relative to the window's new origin. Only
    // pointermove samples contribute to the drag distance.
    if (event.type!=='pointerup') drag.cancelled=true;
    drag.finished=true;
  }

  function bind(target,direction) {
    target.addEventListener('pointerdown',event=>{
      if (!event.isPrimary || event.button!==0 || (drag&&!drag.finished)) return;
      if (direction==='move' && event.pointerType==='mouse') return;
      target.setPointerCapture(event.pointerId);
      event.preventDefault();
      drag={
        id:event.pointerId,direction,dx:0,dy:0,dpi:window.devicePixelRatio,
        screenX:event.screenX,screenY:event.screenY,appliedX:0,appliedY:0,
        anchor:event.clientX/window.innerWidth
      };
    });
    target.addEventListener('pointermove',move);
    for (const event of ['pointerup','pointercancel','lostpointercapture']) target.addEventListener(event,finish);
  }

  bind(caption,'move');
  for (const direction of resizeDirections) {
    const handle=document.createElement('div');
    handle.dataset.windowResize=direction;
    handles.append(handle);
    bind(handle,direction);
  }
}
