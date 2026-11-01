/**
 * پل امن بین پنجره‌ی برنامه و فرآیند اصلی Electron.
 * فقط چند تابع مشخص را در window.tmDesktop در اختیار صفحه می‌گذارد.
 */
const { contextBridge, ipcRenderer } = require('electron');

let handler = null;

// فرآیند اصلی (سرور همگام‌سازی) درخواستی می‌فرستد؛ صفحه روی دیتابیس خودش اجرا می‌کند
ipcRenderer.on('hub:request', async (_event, msg) => {
  const { id, op, args } = msg || {};
  try {
    if (!handler) throw new Error('hub handler is not registered');
    const result = await handler(op, args);
    ipcRenderer.send('hub:response', { id, ok: true, result });
  } catch (err) {
    ipcRenderer.send('hub:response', { id, ok: false, error: String((err && err.message) || err) });
  }
});

contextBridge.exposeInMainWorld('tmDesktop', {
  isDesktop: true,
  /** برنامه‌ی React پردازشگر درخواست‌ها را ثبت می‌کند */
  registerHubHandler: (fn) => {
    handler = fn;
    ipcRenderer.send('hub:ready');
  },
  getHubInfo: () => ipcRenderer.invoke('hub:info'),
  rotateHubToken: () => ipcRenderer.invoke('hub:rotate-token'),
  openWebVersion: () => ipcRenderer.invoke('hub:open-web'),
});
