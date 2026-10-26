(async()=>{
  const invoke=window.__TAURI__.core.invoke,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  try{
    for(let n=0;n<100&&!document.querySelector('[data-add]');n++)await wait(100);
    check(document.querySelectorAll('[data-add]').length===15,'元件库未加载');
    if(!sessionStorage.getItem('system-smoke-reload')){
      document.getElementById('emptyCreateButton').click();document.getElementById('experimentNameInput').value='系统 WebView 验证';document.getElementById('nameForm').requestSubmit();
      document.querySelector('[data-add="battery"]').click();await wait(350);
      document.getElementById('settingsButton').click();document.getElementById('themeSetting').value='dark';document.getElementById('themeSetting').dispatchEvent(new Event('change'));
      document.getElementById('uiScaleSetting').value='1.25';document.getElementById('uiScaleSetting').dispatchEvent(new Event('change'));
      document.getElementById('settingsDialog').close();await wait(250);
      check(document.documentElement.dataset.theme==='dark','深色主题未应用');
      sessionStorage.setItem('system-smoke-reload','1');location.reload();return;
    }
    await wait(400);
    check(document.getElementById('activeExperimentName').textContent==='系统 WebView 验证','重载后实验丢失');
    check(document.querySelector('[data-component="e1"]'),'元件未保存');
    check(document.documentElement.dataset.theme==='dark','主题未保存');
    check(document.documentElement.style.getPropertyValue('--ui-scale')==='1.25'&&document.getElementById('uiScaleSetting').value==='1.25','UI 缩放未保存');
    const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));
    const {serializeExperiment}=await import('./files.js');
    check(await invoke('save_experiment',{content:serializeExperiment(data.experiments[0].state,'系统 WebView 验证'),name:'实验.json'}),'原生导出失败');
    document.querySelector('[data-add="resistor"]').click();document.querySelector('[data-tool="junction"]').click();
    for(const terminal of ['e1:0','r1:0','r1:1','e1:1'])document.querySelector(`[data-terminal="${terminal}"]`).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    document.querySelector('[data-tool="select"]').click();document.querySelector('[data-component="e1"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const flow=document.querySelector('.wire-flow');check(flow,'电流动画未显示');
    for(let i=0;i<20;i++){const input=document.getElementById('propertyRange');input.value=String(2+i*.4);input.dispatchEvent(new Event('input',{bubbles:true}));check(flow.isConnected&&document.querySelector('.wire-flow')===flow,'调节电压重建了电流动画');}
    await invoke('set_fullscreen',{fullscreen:true});await invoke('set_fullscreen',{fullscreen:false});
    await invoke('system_smoke_report',{report:{engine:navigator.userAgent,components:2,theme:'dark',uiScale:1.25,persistence:true,export:true,fullscreen:true,currentFlow:true}});
  }catch(error){await invoke('system_smoke_report',{report:{error:error.stack||String(error)}});}
})();
