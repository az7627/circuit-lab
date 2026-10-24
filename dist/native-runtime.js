// The bundled GeckoView edition runs the same local app as a built-in extension.
(()=>{
  if(location.protocol!=='moz-extension:'||!globalThis.browser?.runtime)return;
  const port=browser.runtime.connectNative('circuitlab'),pending=new Map();let next=0;
  const call=(action,data={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});port.postMessage({id,action,...data});});
  port.onMessage.addListener(message=>{
    if(message.event==='back'){port.postMessage({action:'backResult',handled:!window.dispatchEvent(new Event('circuitlab:back',{cancelable:true}))});return;}
    const request=pending.get(message.id);if(!request)return;pending.delete(message.id);message.error?request.reject(new Error(message.error)):request.resolve(message.result);
  });
  port.onDisconnect.addListener(()=>{for(const request of pending.values())request.reject(new Error('原生连接已断开，请重新打开应用。'));pending.clear();});
  window.Capacitor={getPlatform:()=> 'android',Plugins:{CircuitFiles:{saveFile:data=>call('saveFile',data)},SystemBars:{hide:()=>call('hideBars'),show:()=>call('showBars'),setStyle:data=>call('barStyle',data)}}};
  call('environment').then(async environment=>{if(environment.smoke){window.CircuitLabEmbeddedSmoke={call};await import('./embedded-smoke.js');}});
})();
