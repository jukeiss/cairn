// Cairn desktop: starts the Next.js server on a free port, then opens it in a window.
// Notes are stored as plain .md files in ~/Documents/Cairn.
'use strict';
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

let server = null;
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}
function waitReady(url, tries = 300) {
  return new Promise((resolve, reject) => {
    const tick = left => http.get(url, res => { res.resume(); resolve(); })
      .on('error', () => (left <= 0 ? reject(new Error('server did not start')) : setTimeout(() => tick(left - 1), 100)));
    tick(tries);
  });
}

app.whenReady().then(async () => {
  const vault = path.join(app.getPath('documents'), 'Cairn');
  fs.mkdirSync(vault, { recursive: true });
  const port = await freePort();
  const appDir = path.join(__dirname, 'cairn-app');
  const next = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  // Run Next.js with Electron's bundled Node; the notes folder comes from CAIRN_VAULT.
  server = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: appDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CAIRN_VAULT: vault, NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  await waitReady(url);

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Cairn',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u); } });
  win.loadURL(url);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (server) server.kill(); });
