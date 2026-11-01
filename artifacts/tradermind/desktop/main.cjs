const path = require('node:path');
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createHub } = require('./syncHub.cjs');

const isExternalUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

let mainWindow = null;
let rendererReady = false;
let hub = null;

// ── ارتباط سرور همگام‌سازی با دیتابیس داخل پنجره ──────────────
const pendingRequests = new Map();
let requestSeq = 0;

function failPending(code, message) {
  for (const [id, p] of pendingRequests) {
    clearTimeout(p.timer);
    p.reject(Object.assign(new Error(message), { code }));
    pendingRequests.delete(id);
  }
}

/** یک عملیات همگام‌سازی را روی دیتابیس واقعی برنامه (داخل پنجره) اجرا می‌کند */
function requestRenderer(op, args) {
  return new Promise((resolve, reject) => {
    const win = mainWindow;
    if (!win || win.isDestroyed() || !rendererReady) {
      reject(Object.assign(new Error('app window not ready'), { code: 'NO_RENDERER' }));
      return;
    }
    const id = ++requestSeq;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(Object.assign(new Error('renderer timeout'), { code: 'TIMEOUT' }));
    }, 120_000);
    pendingRequests.set(id, { resolve, reject, timer });
    win.webContents.send('hub:request', { id, op, args });
  });
}

function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (event.sender !== mainWindow.webContents) return false;
  const url = event.senderFrame && event.senderFrame.url;
  return typeof url === 'string' && url.startsWith('file://');
}

ipcMain.on('hub:ready', (event) => {
  if (isTrustedSender(event)) rendererReady = true;
});

ipcMain.on('hub:response', (event, msg) => {
  if (!isTrustedSender(event) || !msg) return;
  const p = pendingRequests.get(msg.id);
  if (!p) return;
  pendingRequests.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.ok) p.resolve(msg.result);
  else p.reject(new Error(msg.error || 'renderer error'));
});

ipcMain.handle('hub:info', (event) => {
  if (!isTrustedSender(event) || !hub) return null;
  return hub.info();
});

ipcMain.handle('hub:rotate-token', (event) => {
  if (!isTrustedSender(event) || !hub) return null;
  return hub.rotateToken();
});

ipcMain.handle('hub:open-web', async (event) => {
  if (!isTrustedSender(event) || !hub) return false;
  const info = hub.info();
  if (!info.running) return false;
  // کد اتصال در بخش hash می‌آید؛ هرگز به سرور فرستاده نمی‌شود
  await shell.openExternal(`${info.localUrl}/#pair=${info.pairCode}`);
  return true;
});

// ── پنجره ─────────────────────────────────────────────────
function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow = window;
  rendererReady = false;

  // هر بار صفحه دوباره بارگذاری شد، تا ثبت مجدد پردازشگر آماده نیست
  window.webContents.on('did-start-loading', () => {
    rendererReady = false;
    failPending('NO_RENDERER', 'page reloaded');
  });

  window.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
    failPending('NO_RENDERER', 'window closed');
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (isExternalUrl(url)) void shell.openExternal(url);
    }
  });

  window.loadFile(path.join(__dirname, '..', 'dist', 'public', 'index.html'));
}

// فقط یک نمونه از برنامه؛ دو نمونه هم‌زمان دیتابیس یکسان و پورت یکسان می‌خواهند
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.tradermind.journal');

    hub = createHub({
      distDir: path.resolve(__dirname, '..', 'dist', 'public'),
      configPath: path.join(app.getPath('userData'), 'sync-hub.json'),
      requestRenderer,
      log: { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a) },
    });
    try {
      await hub.start();
    } catch (error) {
      console.error('[hub] failed to start', error);
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    if (hub) void hub.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
