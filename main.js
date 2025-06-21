const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
if (!app.isPackaged) {
  win.webContents.openDevTools();
}
  // Hide default menu and set custom menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project',
          accelerator: 'Ctrl+O',
          click: () => {
            win.webContents.send('menu-open-project');
          }
        },
        {
          label: 'Save Project',
          accelerator: 'Ctrl+S',
          click: () => {
            win.webContents.send('menu-save-project');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

ipcMain.handle('open-image-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled) return [];
  return filePaths;
});

ipcMain.handle('save-enefty', async (event, data) => {
  const { filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Enefty Project', extensions: ['enefty'] }]
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('open-enefty', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Enefty Project', extensions: ['enefty'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return JSON.parse(content);
});

ipcMain.handle('save-png', async (event, pngBuffer) => {
  const { filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (!filePath) return false;
  // pngBuffer may be a Uint8Array, ensure it's written as a buffer
  fs.writeFileSync(filePath, Buffer.from(pngBuffer));
  return true;
});

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle('bulk-save-png', async (event, { folder, files }) => {
  // files: [{ name: 'filename.png', buffer: Uint8Array }]
  const fs = require('fs');
  for (const file of files) {
    fs.writeFileSync(require('path').join(folder, file.name), Buffer.from(file.buffer));
  }
  return true;
});
