(async()=>{
  const call=window.CircuitLabEmbeddedSmoke.call,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),check=(value,message)=>{if(!value)throw new Error(message);};
  try{
    for(let n=0;n<150&&!document.querySelector('[data-add]');n++)await wait(100);
    if(!sessionStorage.getItem('embedded-smoke-reload')){
      check(document.documentElement.dataset.theme==='dark','Android 系统深色模式未生效');
      document.getElementById('emptyCreateButton').click();document.getElementById('experimentNameInput').value='内置内核验证';document.getElementById('nameForm').requestSubmit();
      document.querySelector('[data-add="battery"]').click();await wait(400);
      sessionStorage.setItem('embedded-smoke-reload','1');location.reload();return;
    }
    await wait(500);check(document.getElementById('activeExperimentName').textContent==='内置内核验证','重载后实验丢失');check(document.querySelector('[data-component="e1"]'),'元件未保存');
    const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2')),files=await import('./files.js');
    check((await call('saveFile',{name:'验证.json',content:files.serializeExperiment(data.experiments[0].state,'内置内核验证')})).saved,'原生文件导出失败');
    await call('hideBars');await wait(400);let bars=await call('barsVisible');check(!bars.status&&!bars.navigation,'全屏未隐藏全部系统栏');
    await call('showBars');await wait(400);bars=await call('barsVisible');check(bars.status&&bars.navigation,'退出全屏未恢复系统栏');
    await call('smokeReport',{report:{engine:navigator.userAgent,systemTheme:document.documentElement.dataset.theme,persistence:true,export:true,fullscreen:true}});
  }catch(error){await call('smokeReport',{report:{error:error.stack||String(error)}});}
})();
