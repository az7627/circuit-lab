(async()=>{
  const invoke=window.__TAURI__.core.invoke,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  async function until(test,message){
    for(let n=0;n<100;n++){if(await test())return;await wait(40);}
    throw new Error(message);
  }
  try{
    for(let n=0;n<100&&!document.querySelector('[data-add]');n++)await wait(100);
    check(document.querySelectorAll('[data-add]').length===15,'元件库未加载');
    if(!sessionStorage.getItem('system-smoke-reload')){
      document.getElementById('emptyCreateButton').click();document.getElementById('experimentNameInput').value='系统 WebView 验证';document.getElementById('nameForm').requestSubmit();
      document.querySelector('[data-add="battery"]').click();await wait(350);
      document.getElementById('settingsButton').click();document.getElementById('themeSetting').value='dark';document.getElementById('themeSetting').dispatchEvent(new Event('change'));
      document.getElementById('uiScaleSetting').value='125';document.getElementById('uiScaleSetting').dispatchEvent(new Event('change'));
      const titleBar=document.getElementById('titleBarSetting');titleBar.checked=true;titleBar.dispatchEvent(new Event('change'));
      await until(()=>document.body.classList.contains('desktop-frameless'),'隐藏标题栏未应用');
      document.getElementById('settingsDialog').close();await wait(250);
      check(document.documentElement.dataset.theme==='dark','深色主题未应用');
      sessionStorage.setItem('system-smoke-reload','1');location.reload();return;
    }
    await wait(400);
    check(document.getElementById('activeExperimentName').textContent==='系统 WebView 验证','重载后实验丢失');
    check(document.querySelector('[data-component="e1"]'),'元件未保存');
    check(document.documentElement.dataset.theme==='dark','主题未保存');
    check(document.documentElement.style.getPropertyValue('--ui-scale')==='1.25'&&document.getElementById('uiScaleSetting').value==='125','UI 缩放未保存');
    await until(()=>document.body.classList.contains('desktop-frameless'),'标题栏设置未保存');
    const chrome=await invoke('desktop_window_state');
    check(!chrome.decorated,'原生标题栏仍然显示');
    for(const [side,actions] of [['Left',chrome.left],['Right',chrome.right]]){
      const actual=[...document.querySelectorAll(`#windowControls${side} button`)].map(button=>button.dataset.windowAction);
      check(JSON.stringify(actual)===JSON.stringify(actions),'窗口按钮顺序与桌面设置不一致');
    }
    if(chrome.macos)check(chrome.left.join(',')==='close,minimize,maximize'&&!chrome.right.length,'macOS 红绿灯未放在左侧');
    const caption=document.querySelector('.header-panel-content');
    const brand=caption.querySelector('.brand');
    check(brand.tagName==='DIV'&&!brand.hasAttribute('tabindex'),'应用标题仍可点击或聚焦');
    check(caption.getAttribute('data-tauri-drag-region')==='deep'&&caption.contains(document.getElementById('layoutControls')),'完整顶栏拖动区域未启用');
    const grips=document.getElementById('windowResizeHandles');
    if(chrome.windows){
      check(!grips.hidden&&grips.children.length===8,'触屏缩放触区缺失');
      const start=await invoke('desktop_window_drag_start',{moving:false});
      await invoke('desktop_window_drag_apply',{
        moving:false,x:start.x+30,y:start.y+20,width:start.width-30,height:start.height-20
      });
      const resized=await invoke('desktop_window_drag_start',{moving:false});
      check(resized.x===start.x+30&&resized.y===start.y+20&&
        resized.width===start.width-30&&resized.height===start.height-20,'窗口左上角缩放未调整边界');
      await invoke('desktop_window_drag_apply',{
        moving:true,x:start.x,y:start.y,width:resized.width,height:resized.height
      });
      const moved=await invoke('desktop_window_drag_start',{moving:false});
      check(moved.x===start.x&&moved.y===start.y&&moved.width===resized.width&&
        moved.height===resized.height,'移动窗口改变了窗口尺寸');
    }
    const headerToggle=document.getElementById('headerToggle');
    headerToggle.click();
    check(headerToggle.disabled&&!document.body.classList.contains('header-collapsed'),'窗口模式下允许收起顶栏');
    const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));
    const {serializeExperiment}=await import('./files.js');
    check(await invoke('save_experiment',{content:serializeExperiment(data.experiments[0].state,'系统 WebView 验证'),name:'实验.json'}),'原生导出失败');
    document.querySelector('[data-add="resistor"]').click();document.querySelector('[data-tool="junction"]').click();
    for(const terminal of ['e1:0','r1:0','r1:1','e1:1'])document.querySelector(`[data-terminal="${terminal}"]`).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    document.querySelector('[data-tool="select"]').click();document.querySelector('[data-component="e1"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const flow=document.querySelector('.wire-flow');check(flow,'电流动画未显示');
    for(let i=0;i<20;i++){const input=document.getElementById('propertyRange');input.value=String(2+i*.4);input.dispatchEvent(new Event('input',{bubbles:true}));check(flow.isConnected&&document.querySelector('.wire-flow')===flow,'调节电压重建了电流动画');}
    const fullscreen=document.getElementById('fullscreenButton');
    fullscreen.click();
    await until(()=>fullscreen.getAttribute('aria-pressed')==='true','未进入全屏');
    check(grips.hidden,'全屏中仍有窗口缩放触区');
    check(!caption.hasAttribute('data-tauri-drag-region'),'全屏中仍可拖动窗口');
    headerToggle.click();
    check(!headerToggle.disabled&&document.body.classList.contains('header-collapsed'),'全屏时不能收起顶栏');
    fullscreen.click();
    await until(()=>fullscreen.getAttribute('aria-pressed')==='false','未退出全屏');
    check(headerToggle.disabled&&!document.body.classList.contains('header-collapsed'),'退出全屏后没有恢复顶栏');
    check(caption.getAttribute('data-tauri-drag-region')==='deep','退出全屏后没有恢复拖动区域');
    const titleBar=document.getElementById('titleBarSetting');titleBar.checked=false;titleBar.dispatchEvent(new Event('change'));
    await until(async()=>(await invoke('desktop_window_state')).decorated,'原生标题栏未恢复');
    await until(()=>!caption.hasAttribute('data-tauri-drag-region'),'原生标题栏恢复后仍可拖动应用顶栏');
    await invoke('system_smoke_report',{report:{engine:navigator.userAgent,components:2,theme:'dark',uiScale:1.25,persistence:true,export:true,fullscreen:true,currentFlow:true,titleBar:true,windowGestures:chrome.windows}});
  }catch(error){await invoke('system_smoke_report',{report:{error:error.stack||String(error)}});}
})();
