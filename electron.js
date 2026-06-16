const { app, BrowserWindow } = require('electron');
const http = require('http');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900
  });

  mainWindow.loadURL('http://localhost:3000');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  require('./server.js');

  const waitForServer = () => {
    http.get('http://localhost:3000', () => {
      createWindow();
    }).on('error', () => {
      setTimeout(waitForServer, 300);
    });
  };

  waitForServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
