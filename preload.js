const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startMover: (settings) => ipcRenderer.invoke('mover:start', settings),
  stopMover: () => ipcRenderer.invoke('mover:stop'),
  updateMover: (settings) => ipcRenderer.invoke('mover:update', settings),
  triggerMove: () => ipcRenderer.invoke('mover:trigger'),
  
  onMoverEvent: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('mover:event', subscription);
    return () => ipcRenderer.removeListener('mover:event', subscription);
  }
});
