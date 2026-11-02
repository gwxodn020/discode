const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('discordCode', {
  sidebar: value => ipcRenderer.invoke('sidebar', value),
  raw: value => ipcRenderer.invoke('raw', value),
  navigate: value => ipcRenderer.invoke('navigate', value),
  refresh: () => ipcRenderer.invoke('refresh'),
  older: value => ipcRenderer.invoke('older', value),
  send: value => ipcRenderer.invoke('send', value),
  external: value => ipcRenderer.invoke('external', value),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onNotice: callback => ipcRenderer.on('notice', (_event, notice) => callback(notice)),
});
