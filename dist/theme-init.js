// Apply appearance before the first paint, including in the desktop CSP.
(()=>{let theme='system';try{theme=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'))?.settings?.theme??'system';}catch{}document.documentElement.dataset.theme=theme==='dark'||theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';})();
