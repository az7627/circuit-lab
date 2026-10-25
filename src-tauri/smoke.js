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
      document.getElementById('settingsDialog').close();await wait(250);
      check(document.documentElement.dataset.theme==='dark','深色主题未应用');
      sessionStorage.setItem('system-smoke-reload','1');location.reload();return;
    }
    await wait(400);
    check(document.getElementById('activeExperimentName').textContent==='系统 WebView 验证','重载后实验丢失');
    check(document.querySelector('[data-component="e1"]'),'元件未保存');
    check(document.documentElement.dataset.theme==='dark','主题未保存');
    const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));
    const {serializeExperiment}=await import('./files.js');
    check(await invoke('save_experiment',{content:serializeExperiment(data.experiments[0].state,'系统 WebView 验证'),name:'实验.json'}),'原生导出失败');
    await invoke('set_fullscreen',{fullscreen:true});await invoke('set_fullscreen',{fullscreen:false});
    await invoke('system_smoke_report',{report:{engine:navigator.userAgent,components:1,theme:'dark',persistence:true,export:true,fullscreen:true}});
  }catch(error){await invoke('system_smoke_report',{report:{error:error.stack||String(error)}});}
})();
