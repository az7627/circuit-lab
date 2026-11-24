// Apply appearance before the first paint, including in the desktop CSP.
globalThis.circuitLabSetSafeArea = insets => {
  ['top','right','bottom','left'].forEach((side,index) => {
    document.documentElement.style.setProperty('--native-inset-'+side, Math.max(0,insets[index]??0)+'px');
  });
};
try{
  const initialInsets=globalThis.CircuitSystemTheme?.safeArea();
  if(initialInsets)globalThis.circuitLabSetSafeArea(JSON.parse(initialInsets));
}catch{}
(()=>{let theme='system',scale=1,dark=matchMedia('(prefers-color-scheme: dark)').matches;try{const settings=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'))?.settings;theme=settings?.theme??'system';if(Number.isFinite(settings?.uiScale))scale=Math.round(Math.max(.25,Math.min(2.5,settings.uiScale))*4)/4;}catch{}try{if(typeof globalThis.CircuitSystemTheme?.isDark==='function'){dark=CircuitSystemTheme.isDark();globalThis.circuitLabNativeDark=dark;}}catch{}document.documentElement.style.setProperty('--ui-scale',scale);document.documentElement.classList.toggle('ui-compact-settings',innerWidth/scale<360);document.documentElement.dataset.theme=theme==='dark'||theme!=='light'&&dark?'dark':'light';})();
