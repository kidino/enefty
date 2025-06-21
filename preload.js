const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eneftyAPI', {
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  saveEnefty: (data) => ipcRenderer.invoke('save-enefty', data),
  openEnefty: () => ipcRenderer.invoke('open-enefty'),
  savePNG: (pngBuffer) => ipcRenderer.invoke('save-png', pngBuffer),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  bulkSavePNG: (folder, files) => ipcRenderer.invoke('bulk-save-png', { folder, files }),
});
