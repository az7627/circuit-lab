import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import {bindWindowGestures,draggedBounds,resizeDirections} from '../dist/window-gestures.js';

const { APP_URL, isAppUrl, resolveAssetPath } = createRequire(import.meta.url)('../desktop/paths.cjs');
const root = path.resolve('dist');

test('window grips resize from each edge and keep the opposite sides fixed at minimum size',()=>{
  const bounds={x:100,y:80,width:900,height:720,minWidth:450,minHeight:750};
  const initial={...bounds,height:900};
  assert.deepEqual(draggedBounds(initial,'move',91,-43),{x:191,y:37,width:900,height:900});
  for(const direction of resizeDirections){
    const result=draggedBounds(initial,direction,direction.includes('w')?700:-700,direction.includes('n')?600:-600);
    assert.equal(result.width,/[ew]/.test(direction)?450:900,direction);
    assert.equal(result.height,/[ns]/.test(direction)?750:900,direction);
    assert.equal(result.x,direction.includes('w')?550:100,direction);
    assert.equal(result.y,direction.includes('n')?230:80,direction);
  }
});

test('a touch release at the moved window origin does not apply the move a second time',async()=>{
  class TouchTarget extends EventTarget {
    dataset={};
    setPointerCapture(){}
  }
  const caption=new TouchTarget(),frames=[],applied=[];
  const globals={window:{innerWidth:1000,devicePixelRatio:1.25},
    document:{createElement:()=>new TouchTarget()},
    requestAnimationFrame:callback=>frames.push(callback)};
  const previous=Object.fromEntries(Object.keys(globals).map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,globals);
  try {
    bindWindowGestures(caption,{append(){}},async(command,args)=>{
      if(command==='desktop_window_drag_start')return {x:100,y:80,width:900,height:900,minWidth:450,minHeight:750};
      applied.push(args);
    });
    const send=(type,screenX)=>caption.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{
      pointerId:1,isPrimary:true,pointerType:'touch',button:0,clientX:500,screenX,screenY:100
    }));
    send('pointerdown',500);
    send('pointermove',540);
    await Promise.resolve();
    await frames.shift()();
    send('pointerup',580);
    assert.deepEqual(applied,[{x:150,y:80,width:900,height:900,moving:true}]);
    assert.equal(frames.length,0);
  } finally {
    for(const [name,value] of Object.entries(previous)){
      if(value===undefined)delete globalThis[name];
      else globalThis[name]=value;
    }
  }
});

test('desktop serves local ES modules, query strings and the home page from the packaged web root', () => {
  assert.equal(resolveAssetPath(APP_URL, root), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath('circuit://lab/', root), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath('circuit://lab/workbench.js?v=2.8', root), path.join(root, 'workbench.js'));
  assert.equal(isAppUrl('circuit://lab/index.html'), true);
});

test('desktop rejects other origins, malformed URLs and encoded filesystem escapes', () => {
  for (const url of [
    'https://lab/index.html', 'file:///etc/passwd', 'circuit://other/index.html',
    'circuit://user@lab/index.html', 'circuit://lab:123/index.html', 'not a url',
    'circuit://lab/%2e%2e%2fpackage.json', 'circuit://lab/%00', 'circuit://lab/%zz'
  ]) assert.equal(resolveAssetPath(url, root), null, url);
  if (process.platform === 'win32') {
    assert.equal(resolveAssetPath('circuit://lab/..%5cpackage.json', root), null);
  }
});
