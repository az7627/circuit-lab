// Capacitor injects this bridge before loading the local page. The web and
// Electron builds keep using the browser's download and file input APIs.
export function androidFiles(bridge = globalThis.Capacitor) {
  if (bridge?.getPlatform?.() !== 'android') return null;
  const files = bridge.Plugins?.CircuitFiles;
  if (!files) throw new Error('文件保存功能尚未就绪，请重新打开应用。');
  return files;
}

export function androidSystemBars(bridge = globalThis.Capacitor) {
  if (bridge?.getPlatform?.() !== 'android') return null;
  const bars = bridge.Plugins?.SystemBars;
  if (!bars) throw new Error('全屏功能尚未就绪，请重新打开应用。');
  return bars;
}

export function systemDesktop(bridge = globalThis.__TAURI__) {
  return typeof bridge?.core?.invoke==='function'?bridge.core:null;
}

export async function saveFile(content, name, type = 'application/json') {
  const native = androidFiles();
  if (native) {
    const result = await native.saveFile({ content, name });
    return result.saved;
  }
  const desktop=systemDesktop();
  if(desktop)return desktop.invoke('save_experiment',{content,name});
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
