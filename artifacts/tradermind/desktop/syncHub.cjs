/**
 * سرور همگام‌سازی داخل برنامه‌ی ویندوز (فرآیند اصلی Electron).
 *
 * - API همگام‌سازی را برای گوشی و نسخه‌ی وب باز می‌کند (با توکن).
 * - خودِ برنامه را هم برای نسخه‌ی وب (مرورگر روی همین کامپیوتر) سرو می‌کند.
 * - هیچ داده‌ای را نگه نمی‌دارد: هر درخواست همگام‌سازی به پنجره‌ی برنامه فرستاده می‌شود
 *   و روی دیتابیس واقعی آن (IndexedDB) اجرا می‌شود؛ پس مرجع اصلی داده همان برنامه‌ی ویندوز است.
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const DEFAULT_PORT = 47821;
const MAX_BODY_BYTES = 256 * 1024 * 1024;

/** باید با HUB_ROUTES در src/sync/protocol.ts یکی باشد */
const API_ROUTES = {
  'GET /api/sync/ping': 'ping',
  'GET /api/sync/tables': 'tables',
  'POST /api/sync/push': 'push',
  'POST /api/sync/pull': 'pull',
  'POST /api/sync/blob/get': 'getBlob',
  'PUT /api/sync/blob': 'putBlob',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/** آدرس‌هایی که گوشی می‌تواند با آن‌ها به این کامپیوتر برسد؛ شبکه‌ی خانگی اول، Tailscale بعد */
function listAddresses(port, interfaces = os.networkInterfaces()) {
  const lan = [];
  const tailscale = [];
  for (const list of Object.values(interfaces)) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (ni.address.startsWith('169.254.')) continue; // link-local
      const [a, b] = ni.address.split('.').map(Number);
      const isTailscale = a === 100 && b >= 64 && b <= 127;
      (isTailscale ? tailscale : lan).push({
        url: `http://${ni.address}:${port}`,
        kind: isTailscale ? 'tailscale' : 'lan',
      });
    }
  }
  return [...lan, ...tailscale];
}

function buildPairCode(token, urls) {
  const json = JSON.stringify({ v: 1, t: token, u: urls });
  return 'tm1.' + Buffer.from(json, 'utf8').toString('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'درخواست بیش از حد بزرگ است'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function loadOrCreateConfig(configPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (typeof cfg.token === 'string' && cfg.token.length >= 32) return cfg;
  } catch { /* فایل نیست یا خراب است */ }
  const cfg = { token: crypto.randomBytes(32).toString('hex'), port: DEFAULT_PORT };
  saveConfig(configPath, cfg);
  return cfg;
}

function saveConfig(configPath, cfg) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/**
 * @param {object} o
 * @param {string} o.distDir  پوشه‌ی ساخته‌شده‌ی نسخه‌ی وب (dist/public)
 * @param {string} o.configPath  فایل ذخیره‌ی توکن و پورت
 * @param {(op:string,args:any)=>Promise<any>} o.requestRenderer  اجرای عملیات روی دیتابیس برنامه
 * @param {number} [o.port]
 * @param {{info:Function,warn:Function}} [o.log]
 */
function createHub({ distDir, configPath, requestRenderer, port, log = console }) {
  const cfg = loadOrCreateConfig(configPath);
  if (port) cfg.port = port;
  let server = null;
  let activePort = null;
  let lastError = null;

  // ── API ──────────────────────────────────────────────────────
  function authorized(req) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return Boolean(m) && safeEqual(m[1].trim(), cfg.token);
  }

  function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  function sendJson(res, status, body) {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }

  async function handleApi(req, res, pathname) {
    const op = API_ROUTES[`${req.method} ${pathname}`];
    if (!op) throw new HttpError(404, 'مسیر نامعتبر');
    if (!authorized(req)) throw new HttpError(401, 'کد اتصال نادرست است');

    let args = {};
    if (req.method !== 'GET') {
      const raw = await readBody(req);
      try { args = raw.length ? JSON.parse(raw.toString('utf8')) : {}; }
      catch { throw new HttpError(400, 'JSON نامعتبر'); }
    }
    try {
      sendJson(res, 200, await requestRenderer(op, args));
    } catch (e) {
      if (e && e.code === 'NO_RENDERER') throw new HttpError(503, 'پنجره‌ی برنامه هنوز آماده نیست');
      if (e && e.code === 'TIMEOUT') throw new HttpError(504, 'برنامه‌ی ویندوز به‌موقع پاسخ نداد');
      throw new HttpError(500, (e && e.message) || 'خطای داخلی');
    }
  }

  // ── فایل‌های نسخه‌ی وب ──────────────────────────────────────
  function safeJoin(root, rel) {
    const full = path.resolve(root, '.' + path.sep + rel);
    return full === root || full.startsWith(root + path.sep) ? full : null;
  }

  async function findStaticFile(pathname) {
    const segs = pathname.split('/').filter(Boolean);
    // نسخه‌ی ساخته‌شده مسیرهای نسبی (./assets/…) دارد؛ از مسیرهای عمیق مثل /journal/trades
    // آدرس‌هایی مثل /journal/assets/x.js ساخته می‌شود. بخش‌های ابتدایی را کم می‌کنیم تا پیدا شود.
    for (let i = 0; i < Math.max(segs.length, 1); i++) {
      const rel = segs.slice(i).join('/') || 'index.html';
      const full = safeJoin(distDir, rel);
      if (!full) continue;
      try {
        const st = await fsp.stat(full);
        if (st.isFile()) return { full, st };
      } catch { /* ادامه */ }
    }
    return null;
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'روش مجاز نیست');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'آدرس نامعتبر'); }
    if (decoded.includes('\0')) throw new HttpError(400, 'آدرس نامعتبر');

    let found = await findStaticFile(decoded);
    const looksLikeFile = path.extname(decoded) !== '';
    if (!found && looksLikeFile) throw new HttpError(404, 'پیدا نشد');
    if (!found) found = await findStaticFile('/index.html'); // مسیرهای داخلی برنامه
    if (!found) throw new HttpError(404, 'نسخه‌ی وب ساخته نشده است');

    const ext = path.extname(found.full).toLowerCase();
    const isShell = ext === '.html' || /(^|[\\/])(sw|service-worker|registerSW|workbox-[\w-]+)\.js$/.test(found.full) || ext === '.webmanifest';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': found.st.size,
      'Cache-Control': isShell ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(found.full).on('error', () => res.destroy()).pipe(res);
  }

  async function onRequest(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://hub.local');
      if (url.pathname.startsWith('/api/')) {
        setCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        await handleApi(req, res, url.pathname);
      } else {
        await serveStatic(req, res, url.pathname);
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) log.warn('[hub] unexpected error', e);
      if (res.headersSent) { res.destroy(); return; }
      if (req.url && req.url.startsWith('/api/')) setCors(res);
      sendJson(res, status, { error: e instanceof HttpError ? e.message : 'خطای داخلی' });
    }
  }

  // ── چرخه‌ی حیات ────────────────────────────────────────────
  function listenOn(p) {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => { void onRequest(req, res); });
      s.requestTimeout = 0; // انتقال فایل‌های بزرگ
      s.headersTimeout = 30_000;
      s.once('error', reject);
      s.listen(p, '0.0.0.0', () => { s.removeListener('error', reject); resolve(s); });
    });
  }

  async function start() {
    if (server) return info();
    const base = cfg.port || DEFAULT_PORT;
    for (let i = 0; i < 10; i++) {
      try {
        server = await listenOn(base + i);
        activePort = base + i;
        lastError = null;
        if (cfg.port !== activePort) { cfg.port = activePort; saveConfig(configPath, cfg); }
        log.info(`[hub] listening on ${activePort}`);
        return info();
      } catch (e) {
        if (e && e.code === 'EADDRINUSE') continue;
        lastError = e && e.message;
        break;
      }
    }
    lastError = lastError || 'هیچ پورت آزادی پیدا نشد';
    return info();
  }

  function stop() {
    return new Promise(resolve => {
      if (!server) return resolve();
      server.close(() => resolve());
      server.closeAllConnections?.();
      server = null;
      activePort = null;
    });
  }

  function rotateToken() {
    cfg.token = crypto.randomBytes(32).toString('hex');
    saveConfig(configPath, cfg);
    return info();
  }

  function info() {
    const running = Boolean(server);
    const addrs = running ? listAddresses(activePort) : [];
    const urls = addrs.map(a => a.url);
    return {
      running,
      port: activePort,
      error: lastError,
      token: cfg.token,
      addresses: addrs,
      localUrl: running ? `http://127.0.0.1:${activePort}` : null,
      pairCode: running ? buildPairCode(cfg.token, urls.length ? urls : [`http://127.0.0.1:${activePort}`]) : null,
    };
  }

  return { start, stop, info, rotateToken };
}

module.exports = { createHub, listAddresses, buildPairCode, API_ROUTES, DEFAULT_PORT };
