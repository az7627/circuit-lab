import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {serializeExperiment} from '../dist/files.js';

const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=path.join(root,'artifacts/ui');
await mkdir(artifacts,{recursive:true});
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'chrome',headless:true});
const url=`http://127.0.0.1:${port}`,errors=[];
let page;
const settle=()=>page.waitForTimeout(350);
const collection=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuit-lab-experiments-v2')));
const view=()=>page.locator('#board').evaluate(board=>({x:Number(board.dataset.cameraX),y:Number(board.dataset.cameraY),zoom:Number(board.dataset.zoom)}));
const world=point=>page.locator('#board').evaluate((board,point)=>{const p=board.createSVGPoint();p.x=point.x;p.y=point.y;const q=p.matrixTransform(board.getScreenCTM().inverse());return {x:q.x,y:q.y};},point);
const close=(a,b,tolerance=.02)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≠ ${b}`);
async function open(context){page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('[data-add]').length===14);}
async function create(name){await page.locator('#emptyCreateButton').click();await page.locator('#experimentNameInput').fill(name);await page.locator('#nameSubmit').click();await settle();}
async function deselect(){const rect=await page.locator('#board').boundingBox();await page.mouse.click(rect.x+12,rect.y+70);await settle();}
async function savedComponents(count){await page.waitForFunction(count=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d?.experiments.find(e=>e.id===d.activeId)?.state.components.length===count;},count);}
async function checkPanelEdges(){
  const layout=await page.evaluate(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect(),w=rect('workspace'),i=rect('inspector'),b=rect('board');return {buttons:['sidebarToggle','toolbarToggle','headerToggle'].map(id=>{const r=rect(id);return {x:r.x,y:r.y,right:r.right,width:r.width,height:r.height};}),inspectorWidth:i.width,inspectorHeight:i.height,boardRight:w.right-b.right,boardBottom:w.bottom-b.bottom};});
  assert.ok(layout.buttons[0].x>=0&&layout.buttons[0].x<=20,JSON.stringify(layout));
  for(let n=0;n<3;n++){const b=layout.buttons[n];assert.ok(b.width>0&&b.height>0&&b.y<=25,JSON.stringify(layout));close(b.y,layout.buttons[0].y);if(n)assert.ok(b.x>=layout.buttons[n-1].right,JSON.stringify(layout));}
  assert.equal(layout.inspectorWidth,0);assert.equal(layout.inspectorHeight,0);
  close(layout.boardRight,0);close(layout.boardBottom,0);
}
const boardGeometry=()=>page.locator('#board').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewBox:el.getAttribute('viewBox')};});
const toggleColors=()=>page.evaluate(()=>['sidebarToggle','toolbarToggle','headerToggle'].map(id=>{const c=getComputedStyle(document.getElementById(id));return {color:c.color,background:c.backgroundColor,border:c.borderColor};}));
async function checkMergedToolbar(){
  const geometry=()=>page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};return {controls:rect('#layoutControls'),tools:rect('.workbench-tools'),panel:rect('#componentPanel'),workspace:rect('#workspace'),above:document.getElementById('workspace').classList.contains('tools-above')};});
  const before=await geometry();
  close(before.controls.x,before.tools.x);close(before.controls.width,before.tools.width);
  assert.ok(before.controls.bottom<=before.tools.y&&before.tools.y-before.controls.bottom<=8,'Corner controls must sit immediately above the tool buttons');
  close(before.panel.x,before.workspace.x);
  if(before.above){
    await page.locator('#componentPanel').evaluate(el=>el.scrollLeft=72);
    const scrolled=await geometry();assert.ok(scrolled.tools.x<before.tools.x-50);
    close(scrolled.controls.x-before.controls.x,scrolled.tools.x-before.tools.x);
    await page.locator('#componentPanel').evaluate(el=>el.scrollLeft=0);
  }
}
async function clickHeaderAction(id){if(await page.locator('#'+id).evaluate(el=>!!el.closest('#headerActionsMenu')?.hidden))await page.locator('#headerMoreButton').click();await page.locator('#'+id).click();}
async function setTheme(value){await clickHeaderAction('settingsButton');await page.locator('#themeSetting').selectOption(value);await settle();}
async function closeSettings(){await page.locator('[data-close="settingsDialog"]').click();await settle();}
async function checkHeaderMenu(){
  const more=page.locator('#headerMoreButton'),menu=page.locator('#headerActionsMenu');
  assert.equal(await page.locator('.experiment-selection').isVisible(),false);
  assert.equal(await page.locator('[data-view-mode="physical"] .view-label-icon').isVisible(),true);
  for(const id of ['zoomOut','zoomLabel','zoomIn','fitButton'])assert.equal(await page.locator('#'+id).isVisible(),true);
  const fit=await page.locator('#fitButton').boundingBox(),ratio=await page.locator('#zoomLabel').boundingBox();
  assert.ok(fit.x>ratio.x);close(fit.y+fit.height/2,ratio.y+ratio.height/2);
  await more.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await more.getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'clearButton');
  assert.deepEqual(await menu.locator('button').evaluateAll(buttons=>buttons.map(button=>button.id)),['clearButton','experimentImportButton','experimentExportButton','fullscreenButton','helpButton','settingsButton']);
  const left=await menu.locator('button .icon').evaluateAll(icons=>icons.map(icon=>icon.getBoundingClientRect().x));for(const x of left)close(x,left[0]);
  await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsButton');
  await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('hidden'),'');assert.equal(await page.evaluate(()=>document.activeElement.id),'headerMoreButton');
  await clickHeaderAction('clearButton');assert.equal(await page.locator('#confirmDialog').isVisible(),true);await page.locator('[data-close="confirmDialog"]').last().click();await settle();
  await clickHeaderAction('helpButton');assert.equal(await page.locator('#guideDialog').isVisible(),true);await page.locator('[data-close="guideDialog"]').click();await settle();
  await more.click();await page.mouse.move(300,500);await settle();await page.screenshot({path:path.join(artifacts,'mobile-header-menu.png')});
  await page.mouse.click(300,700);assert.equal(await more.getAttribute('aria-expanded'),'false');
  await setTheme('dark');await closeSettings();await more.click();await page.mouse.move(300,500);await settle();await page.screenshot({path:path.join(artifacts,'mobile-header-menu-dark.png')});
  await page.keyboard.press('Escape');await setTheme('system');await closeSettings();
  await more.click();await page.setViewportSize({width:1600,height:900});await settle();
  assert.equal(await more.isVisible(),false);assert.equal(await page.locator('#settingsButton').isVisible(),true);assert.equal(await menu.getAttribute('hidden'),'');
  await page.setViewportSize({width:390,height:844});await settle();
}

try{
  await open(await browser.newContext({viewport:{width:1600,height:900},colorScheme:'light'}));
  assert.equal(await page.locator('#workspace').isVisible(),false);
  assert.equal(await page.locator('#emptyWorkspace').isVisible(),true);
  assert.equal(await page.locator('#saveExperimentButton,#saveStatus,.sidebar-foot,.board-caption,.measurement-list,#totalCurrent,#totalVoltage,#totalResistance').count(),0);
  await page.screenshot({path:path.join(artifacts,'welcome.png')});
  await create('自动保存与布局验证');
  await page.locator('[data-view-mode="physical"]').click();
  await page.locator('[data-add="battery"]').click();
  await page.locator('#propertyNumber').fill('9');await page.locator('#propertyNumber').press('Tab');
  await savedComponents(1);
  await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments[0].state.components[0].value===9;});
  await page.reload();await page.waitForSelector('[data-component="e1"]');await settle();
  assert.equal(await page.locator('#activeExperimentName').textContent(),'自动保存与布局验证');
  assert.equal(await page.locator('#propertiesSection').isVisible(),false);
  assert.equal(await page.locator('#inspector').isVisible(),false);
  const beforeSelection=await boardGeometry();
  await page.locator('[data-component="e1"] .component-hit').click();
  await settle();assert.equal(await page.locator('#inspector').isVisible(),true);
  assert.deepEqual(await boardGeometry(),beforeSelection,'Opening properties must leave the canvas and camera unchanged');
  assert.equal(await page.locator('#propertiesTitle').textContent(),'元件属性');
  await page.locator('[data-component="e1"]').focus();
  const outline=await page.locator('[data-component="e1"]').evaluate(el=>({native:getComputedStyle(el).outlineStyle,dash:getComputedStyle(el.querySelector('.component-outline')).strokeDasharray}));
  assert.equal(outline.native,'none');assert.ok(outline.dash.includes('4'));
  await deselect();assert.equal(await page.locator('#propertiesSection').isVisible(),false);assert.equal(await page.locator('#inspector').isVisible(),false);await checkPanelEdges();
  await page.screenshot({path:path.join(artifacts,'desktop.png')});

  await page.mouse.move(700,300);await settle();const colors=await toggleColors();
  for(let mask=0;mask<8;mask++){
    for(const [n,id] of ['sidebarToggle','toolbarToggle','headerToggle'].entries())if((await page.locator('#'+id).getAttribute('aria-expanded')==='true')!==!!(mask&(1<<n)))await page.locator('#'+id).click();
    await page.mouse.move(700,300);await settle();
    assert.deepEqual(await toggleColors(),colors,'Layout control colors must not depend on expanded state');await checkPanelEdges();
    if(mask===2)await checkMergedToolbar();
  }

  assert.equal(await page.evaluate(()=>document.documentElement.dataset.themePreference),'system');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await settle();
  await page.screenshot({path:path.join(artifacts,'desktop-dark.png')});
  await setTheme('light');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await closeSettings();
  await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','An explicit light choice must override the system');
  await setTheme('dark');await page.screenshot({path:path.join(artifacts,'settings-dark.png')});await closeSettings();
  await page.reload();await page.waitForSelector('#board');await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.equal((await collection()).settings.theme,'dark');
  await setTheme('system');await closeSettings();await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');

  const rect=await page.locator('#board').boundingBox(),cursor={x:Math.round(rect.x+rect.width*.6),y:Math.round(rect.y+rect.height*.55)},before=await view(),anchor=await world(cursor);
  await page.mouse.move(cursor.x,cursor.y);await page.mouse.wheel(0,-120);
  await page.waitForFunction(z=>Number(document.getElementById('board').dataset.zoom)>z,before.zoom);
  const during=await view(),target=before.zoom*Math.exp(120*.0012);
  assert.ok(during.zoom<target,'Mouse wheel zoom should animate through intermediate values');
  await settle();const after=await view(),anchored=await world(cursor);close(after.zoom,target,.0001);close(anchor.x,anchored.x);close(anchor.y,anchored.y);

  await page.locator('#headerToggle').click();await settle();
  assert.equal(await page.locator('#headerPanel').evaluate(el=>el.getBoundingClientRect().height),0);
  assert.equal(await page.locator('#headerPanel').evaluate(el=>el.inert),true);
  await checkPanelEdges();
  await page.locator('#toolbarToggle').click();await settle();
  assert.equal(await page.locator('#componentPanel').evaluate(el=>el.inert),true);
  await page.reload();await page.waitForSelector('#board');await settle();
  assert.equal(await page.locator('#headerToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#toolbarToggle').getAttribute('aria-expanded'),'false');
  await page.locator('#headerToggle').click();await page.locator('#toolbarToggle').click();await settle();

  for(const size of [{width:1600,height:900},{width:1024,height:768},{width:390,height:844},{width:320,height:700},{width:844,height:390},{width:800,height:1200}]){
    await page.setViewportSize(size);await settle();
    if(size.width<=900&&await page.locator('#sidebarToggle').getAttribute('aria-expanded')==='true'){await page.locator('#sidebarToggle').click();await settle();}
    const layout=await page.evaluate(()=>{const w=document.getElementById('workspace'),b=document.getElementById('board').getBoundingClientRect(),r=w.getBoundingClientRect(),h=document.querySelector('.site-header'),stage=Number(h.dataset.compact);return {above:w.classList.contains('tools-above'),expected:r.width-parseFloat(getComputedStyle(w).getPropertyValue('--tool-width'))<r.height,width:b.width,height:b.height,headerHeight:h.getBoundingClientRect().height,headerOverflow:h.scrollWidth>h.clientWidth+1,stage,stages:['header-compact-brand','header-icons-only','header-short-modes','header-no-logo','header-hide-experiment','header-mode-icons','header-overflow'].map(c=>h.classList.contains(c)),rows:[...h.children].filter(el=>getComputedStyle(el).display!=='none').map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;}),overflow:document.documentElement.scrollWidth>innerWidth,libraryOverflow:getComputedStyle(document.getElementById('componentLibrary')).overflowY};});
    assert.equal(layout.above,layout.expected,JSON.stringify({size,layout}));
    assert.ok(layout.width>150&&layout.height>100,JSON.stringify({size,layout}));
    assert.equal(layout.overflow,false);assert.equal(layout.libraryOverflow,'visible');
    assert.ok(layout.headerHeight<=64);assert.ok(Math.max(...layout.rows)-Math.min(...layout.rows)<4,JSON.stringify(layout));
    assert.equal(layout.headerOverflow,false,JSON.stringify({size,layout}));
    for(let n=0;n<layout.stages.length;n++)assert.equal(layout.stages[n],n<layout.stage,'Header reductions must follow the requested priority');
    await checkPanelEdges();
    if(size.width===390){
      assert.ok(layout.width>=size.width-1,JSON.stringify(layout));await page.screenshot({path:path.join(artifacts,'mobile.png')});
      await checkHeaderMenu();
      await page.locator('#headerToggle').focus();await page.keyboard.press('Enter');await settle();
      await checkMergedToolbar();assert.equal(await page.evaluate(()=>document.activeElement.id),'headerToggle');
      await page.mouse.move(300,300);await page.screenshot({path:path.join(artifacts,'toolbar-only-light.png')});
      await page.emulateMedia({colorScheme:'dark'});await settle();await page.screenshot({path:path.join(artifacts,'toolbar-only-dark.png')});
      await page.emulateMedia({colorScheme:'light'});
      await page.locator('#toolbarToggle').focus();await page.keyboard.press('Enter');await settle();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'toolbarToggle');
      assert.equal(await page.locator('#layoutControls').evaluate(el=>!!el.closest('[inert]')),false);
      await page.keyboard.press('Enter');await settle();assert.equal(await page.evaluate(()=>document.activeElement.id),'toolbarToggle');
      await page.locator('#headerToggle').click();await settle();
    }
  }

  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await open(mobile);await create('双指操作验证');
  await page.locator('[data-view-mode="physical"]').click();await page.locator('[data-add="battery"]').click();await deselect();
  const cdp=await mobile.newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:3,radiusY:3,force:1}))});
  const tap=async point=>{await touch('touchStart',[{...point,id:10}]);await touch('touchEnd',[]);await settle();};
  let hit=await page.locator('[data-component="e1"] .component-hit').boundingBox();
  await tap({x:hit.x+hit.width/2,y:hit.y+hit.height/2});
  assert.equal(await page.locator('#propertiesSection').isVisible(),true);
  assert.equal(await page.locator('#inspector').isVisible(),true);
  const mobileBoard=await boardGeometry();
  await page.screenshot({path:path.join(artifacts,'mobile-properties.png')});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await settle();
  assert.deepEqual(await boardGeometry(),mobileBoard);await page.screenshot({path:path.join(artifacts,'mobile-dark.png')});
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  const oldPosition=(await collection()).experiments[0].state.components[0];
  hit=await page.locator('[data-component="e1"] .component-hit').boundingBox();
  const dragPoint={x:hit.x+hit.width/2,y:hit.y+hit.height/2,id:11};
  await touch('touchStart',[dragPoint]);await touch('touchMove',[{...dragPoint,x:dragPoint.x+20,y:dragPoint.y+15}]);await touch('touchEnd',[]);await settle();
  assert.notEqual((await collection()).experiments[0].state.components[0].x,oldPosition.x);
  const blank=await page.locator('#board').boundingBox();await tap({x:blank.x+12,y:blank.y+70});
  assert.equal(await page.locator('#propertiesSection').isVisible(),false);
  assert.equal(await page.locator('#inspector').isVisible(),false);await checkPanelEdges();
  async function pinchInTool(tool){
    await page.locator(`[data-tool="${tool}"]`).click();await settle();
    const hit=await page.locator('[data-component="e1"] .component-hit').boundingBox(),board=await page.locator('#board').boundingBox(),x=Math.min(board.x+board.width-140,Math.max(board.x+60,hit.x+hit.width/2)),y=Math.min(board.y+board.height-40,Math.max(board.y+50,hit.y+hit.height/2));
    const initial=await view(),a={x,y,id:1},b={x:x+70,y,id:2},mid={x:x+35,y},anchor=await world(mid);
    await touch('touchStart',[a]);await touch('touchStart',[a,b]);
    await touch('touchMove',[{...a,x:x-20,y:y+20},{...b,x:x+100,y:y+20}]);
    const pinched=await view(),anchored=await world({x:x+40,y:y+20});
    close(pinched.zoom,Math.min(5,initial.zoom*120/70),.001);close(anchor.x,anchored.x,.05);close(anchor.y,anchored.y,.05);
    await page.waitForTimeout(100);close((await view()).zoom,pinched.zoom,.00001);
    // Keep one finger down and pan, then release without triggering a tap.
    await touch('touchEnd',[{...b,x:x+100,y:y+20}]);
    await touch('touchMove',[{...b,x:x+110,y:y+25}]);await touch('touchEnd',[]);await settle();
    const d=await collection(),state=d.experiments.find(e=>e.id===d.activeId).state;
    assert.equal(state.components.length,1);assert.equal(state.junctions.length,0);assert.equal(state.wires.length,0);
  }
  await pinchInTool('erase');await pinchInTool('junction');
  const finalView=await view();await page.reload();await page.waitForSelector('#board');await settle();close((await view()).zoom,finalView.zoom,.001);
  await page.screenshot({path:path.join(artifacts,'touch.png')});
  await page.locator('[data-tool="junction"]').click();
  const blankNode=await page.locator('#board').boundingBox();await tap({x:blankNode.x+15,y:blankNode.y+90});
  assert.equal((await collection()).experiments[0].state.junctions.length,1);
  await page.locator('#undoButton').click();await settle();assert.equal((await collection()).experiments[0].state.junctions.length,0);
  const exported=serializeExperiment((await collection()).experiments[0].state,'导入入口验证');
  const sibling=await mobile.newPage();sibling.on('pageerror',error=>errors.push(error.stack));
  await sibling.goto(url);await sibling.waitForSelector('#board');await sibling.waitForTimeout(300);
  if(await page.locator('#sidebarToggle').getAttribute('aria-expanded')==='false')await page.locator('#sidebarToggle').click();
  await page.locator('[data-doc-menu]').click();await page.locator('[data-doc-action="archive"]').click();await settle();
  assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('#emptyWorkspace').isVisible(),true);
  await sibling.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return document.getElementById('workspace').hidden&&d.draft?.components.length===1;});
  await sibling.close();

  const native=await browser.newContext({viewport:{width:390,height:844}});
  await native.addInitScript(()=>{window.nativeBarCalls=[];window.Capacitor={getPlatform:()=> 'android',Plugins:{SystemBars:{hide:async()=>window.nativeBarCalls.push('hide'),show:async()=>window.nativeBarCalls.push('show')}}};});
  await open(native);await clickHeaderAction('fullscreenButton');
  await page.waitForFunction(()=>document.getElementById('fullscreenButton').getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>window.dispatchEvent(new Event('circuitlab:back',{cancelable:true})));
  await page.waitForFunction(()=>document.getElementById('fullscreenButton').getAttribute('aria-pressed')==='false');
  assert.deepEqual(await page.evaluate(()=>window.nativeBarCalls),['hide','show']);
  await page.locator('#experimentFile').setInputFiles({name:'实验.json',mimeType:'application/json',buffer:Buffer.from(exported)});
  await page.waitForFunction(()=>document.getElementById('activeExperimentName').textContent==='导入入口验证');
  assert.equal(await page.locator('#workspace').isVisible(),true);assert.equal(await page.locator('#emptyWorkspace').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('栏位按钮、单行顶栏、悬浮属性、系统与手动主题、自动保存、鼠标及触屏交互检查通过。');
}catch(error){
  if(page&&!page.isClosed())await page.screenshot({path:path.join(artifacts,'failed.png')}).catch(()=>{});
  await writeFile(path.join(artifacts,'error.txt'),`${error.stack}\n${errors.join('\n')}`);throw error;
}finally{await browser.close();server.kill();}
