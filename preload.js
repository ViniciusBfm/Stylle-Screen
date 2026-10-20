const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Tela de captura
  onInit: cb => ipcRenderer.on('overlay:init', (_e, data) => cb(data)),
  ready: () => ipcRenderer.send('overlay:ready'),
  done: (action, png, prefs) => ipcRenderer.invoke('overlay:done', { action, png, prefs }),
  cancel: () => ipcRenderer.send('overlay:cancel'),

  // Janela principal
  getState: () => ipcRenderer.invoke('home:get'),
  setSettings: patch => ipcRenderer.invoke('home:set', patch),
  capture: () => ipcRenderer.send('home:capture'),
  chooseFolder: () => ipcRenderer.invoke('home:chooseFolder'),
  openFolder: () => ipcRenderer.send('home:openFolder'),
  openKeyboardSettings: () => ipcRenderer.send('home:openKeyboardSettings'),
  onState: cb => ipcRenderer.on('home:state', (_e, state) => cb(state)),
});
