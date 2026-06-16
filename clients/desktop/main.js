// DAZ desktop app (Electron) — opens a window pointing at your DAZ server.
// Set the server with env DAZ_SERVER, e.g.:
//   set DAZ_SERVER=https://my-daz.trycloudflare.com  &&  npm start
// Default is http://localhost:8080. You can also change the server later from
// the in-app «شخصیت» panel (اتصال به سرور).
const { app, BrowserWindow } = require('electron');

const SERVER = process.env.DAZ_SERVER || 'http://localhost:8080';

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'DAZ',
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
  });
  win.loadURL(SERVER);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
