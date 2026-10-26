import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'msedge',headless:true});
const results=[],errors=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<.1,`${a} != ${b}`);
try{
  for(const scenario of [{label:'mouse',touch:false,width:1600,height:1000},{label:'touch-scroll-horizontal',touch:true,width:420,height:900},{label:'touch-scroll-vertical',touch:true,width:1600,height:500},{label:'touch-fit',touch:true,width:1600,height:1200},{label:'hybrid-mouse-scroll',touch:false,hardware:true,width:420,height:900}]){
    const {touch}=scenario;
    const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},hasTouch:touch||scenario.hardware,isMobile:touch&&scenario.width<500,colorScheme:'dark'});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));
    await page.goto(`http://127.0.0.1:${port}`);await page.locator('#emptyCreateButton').click();
    await page.locator('#experimentNameInput').fill(touch?'直接触摸拖动':'直接鼠标拖动');await page.locator('#nameSubmit').click();
    await page.waitForTimeout(400);
    assert.equal(await page.title(),'电路实验室');
    const card=page.locator('[data-add="battery"]'),board=page.locator('#board');
    const count=()=>page.locator('[data-component]').count();
    const center=async locator=>{const r=await locator.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
    let start=await center(card);const box=await board.boundingBox(),end={x:box.x+box.width*.64,y:box.y+box.height*.4};
    const expected=await board.evaluate((el,point)=>{const p=el.createSVGPoint();p.x=point.x;p.y=point.y;const q=p.matrixTransform(el.getScreenCTM().inverse());return {x:Math.round(q.x/10)*10,y:Math.round(q.y/10)*10};},end);
    const session=await context.newCDPSession(page);
    const input=async(type,point=start)=>touch
      ?session.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'}[type],touchPoints:['up','cancel'].includes(type)?[]:[{...point,id:1}]})
      :type==='down'?page.mouse.move(point.x,point.y).then(()=>page.mouse.down()):type==='move'?page.mouse.move(point.x,point.y,{steps:6}):page.mouse.up();
    const needsHold=()=>page.locator('#componentPanel').evaluate((el,touch)=>touch&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2),touch);
    const beginDrag=async()=>{await input('down');if(await needsHold()){await page.waitForSelector('.is-drag-ready');}};
    if(touch&&await needsHold()){
      const axis=await page.locator('#componentPanel').evaluate(el=>el.scrollWidth>el.clientWidth+2?'x':'y');
      await input('down');await input('move',{x:start.x-(axis==='x'?140:0),y:start.y-(axis==='y'?140:0)});await input('up');
      assert.equal(await count(),0,'Scrolling on a card must not add a part');assert.equal(await page.locator('.library-drag-preview,.is-drag-ready').count(),0);
      assert.ok(await page.locator('#componentPanel').evaluate((el,axis)=>(axis==='x'?el.scrollLeft:el.scrollTop)>60,axis),'Finger motion must scroll the actual panel');
      await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));const el=document.getElementById('componentPanel');el.scrollLeft=0;el.scrollTop=0;});
      await input('down');await input('cancel');await page.waitForTimeout(450);assert.equal(await page.locator('.is-drag-ready').count(),0,'Cancelled holds must not arm later');
    }
    await beginDrag();await input('move',end);
    assert.equal(await page.locator('.library-drag-preview.can-drop').count(),1,'Dragging must preview a valid drop after the required gesture');
    await page.screenshot({path:`artifacts/ui/drag-active-${scenario.label}.png`});
    const sourceColor=await card.evaluate(el=>getComputedStyle(el).backgroundColor);assert.ok(!/rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(sourceColor),'Dark dragging must not expose a light active background');
    await input('up');assert.equal(await count(),1,'A drop must create exactly one component');
    await page.waitForTimeout(350);
    const saved=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components[0];});
    near(saved.x,expected.x);near(saved.y,expected.y);
    assert.equal(await page.locator('.library-drag-preview').count(),0);
    await page.locator('#undoButton').click();assert.equal(await count(),0);await page.locator('#redoButton').click();assert.equal(await count(),1);
    await beginDrag();await input('move',{x:30,y:30});await input('up');assert.equal(await count(),1,'Dropping outside the canvas must cancel');
    await beginDrag();await input('move',end);
    if(touch)await input('cancel');else await page.keyboard.press('Escape');
    if(!touch)await input('up');assert.equal(await count(),1,'Cancelled drags must not create a component');
    await input('down');await input('up');assert.equal(await count(),2,'A tap must still add exactly one component');
    if(!touch&&scenario.width>1000){
      await card.focus();await page.keyboard.press('Space');assert.equal(await count(),3,'Keyboard activation must remain accessible');
      await beginDrag();await input('move',end);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await input('up');assert.equal(await count(),3);
      await page.locator('#zoomIn').click();await beginDrag();await input('move',end);await input('up');assert.equal(await count(),4,'Dragging must work after zooming');
      const alignment=await page.evaluate(()=>{const center=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return r.y+r.height/2;};const svg=document.querySelector('#settingsButton svg'),b=svg.getBBox();return {settings:center('#settingsButton svg'),help:center('#helpButton svg'),header:center('.site-header'),glyph:b.y+b.height/2};});
      near(alignment.settings,alignment.help);assert.ok(Math.abs(alignment.settings-alignment.header)<=1);near(alignment.glyph,12);
    }
    if(touch){
      await beginDrag();await input('move',end);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...end,id:1},{x:end.x+40,y:end.y,id:2}]});
      await input('cancel');assert.equal(await count(),2,'A second finger must cancel the library drag');
    }
    const beforePhysical=await count();await page.locator('[data-view-mode="physical"]').click();
    await page.waitForFunction(()=>document.querySelector('#boardWrap.physical-board')&&!document.querySelector('#board[aria-busy]'));
    await page.waitForTimeout(350);start=await center(card);
    await beginDrag();await input('move',end);assert.equal(await page.locator('.library-drag-preview.can-drop').count(),1);
    await input('up');assert.equal(await count(),beforePhysical+1,'Physical view must support the same immediate drag');
    await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:`artifacts/ui/library-drag-${scenario.label}.png`});
    results.push({input:scenario.label,holdRequired:await needsHold(),placement:true,cancel:true,tap:true,undo:true});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile('artifacts/ui/library-drag-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.kill();}
