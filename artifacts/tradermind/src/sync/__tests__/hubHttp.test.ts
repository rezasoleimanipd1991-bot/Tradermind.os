// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Dexie from 'dexie';
import { createSyncCore } from '../../db/syncCore';
import { installSyncHooks } from '../../db/syncSupport';
import { createHubHandler } from '../hubHandler';
import { runSync, createHttpTransport } from '../syncClient';
import { HubUnreachableError, SyncHttpError } from '../protocol';

const require = createRequire(import.meta.url);
const { createHub, listAddresses, buildPairCode } = require('../../../desktop/syncHub.cjs');

const SCHEMA = { trades: 'id', chartScreenshots: 'id', syncTombstones: 'id, table, deletedAt', syncMeta: 'key' };
let n = 0;
function makePeer() {
  const db = new Dexie(`http-peer-${++n}-${Math.random()}`);
  db.version(1).stores(SCHEMA);
  installSyncHooks(db);
  return { db, core: createSyncCore(db) };
}

describe('hub HTTP server', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hub-'));
  const dist = path.join(tmp, 'public');
  const hubPeer = makePeer();
  const handler = createHubHandler(hubPeer.core);
  let rendererReady = true;
  let hub: ReturnType<typeof createHub>;
  let base = '';
  let token = '';

  beforeAll(async () => {
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<html>app</html>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'top secret');
    hub = createHub({
      distDir: dist,
      configPath: path.join(tmp, 'cfg', 'sync-hub.json'),
      port: 48000 + Math.floor(Math.random() * 1000),
      requestRenderer: async (op: string, args: any) => {
        if (!rendererReady) throw Object.assign(new Error('x'), { code: 'NO_RENDERER' });
        return JSON.parse(JSON.stringify(await handler(op, args)));
      },
      log: { info() {}, warn() {} },
    });
    const info = await hub.start();
    expect(info.running).toBe(true);
    base = `http://127.0.0.1:${info.port}`;
    token = info.token;
  });

  afterAll(async () => { await hub.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('rejects requests without or with a wrong token', async () => {
    expect((await fetch(`${base}/api/sync/ping`)).status).toBe(401);
    expect((await fetch(`${base}/api/sync/ping`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${base}/api/sync/ping`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it('answers CORS preflight', async () => {
    const r = await fetch(`${base}/api/sync/push`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('returns 503 when the app window is not ready', async () => {
    rendererReady = false;
    try {
      const r = await fetch(`${base}/api/sync/ping`, { headers: { Authorization: `Bearer ${token}` } });
      expect(r.status).toBe(503);
    } finally { rendererReady = true; }
  });

  it('syncs phone and web over real HTTP', async () => {
    const phone = makePeer();
    const web = makePeer();
    await phone.db.table('trades').add({ id: 'http-1', note: 'over http' });
    await phone.db.table('chartScreenshots').add({
      id: 'img-1', imageBlob: new Blob([new Uint8Array([5, 4, 3])], { type: 'image/png' }),
    });
    const t = createHttpTransport(base, token);
    await runSync(phone.core, t);
    expect((await hubPeer.db.table('trades').get('http-1')).note).toBe('over http');
    expect((await hubPeer.db.table('chartScreenshots').get('img-1')).imageBlob.size).toBe(3);

    const r = await runSync(web.core, createHttpTransport(base, token));
    expect((await web.db.table('trades').get('http-1')).note).toBe('over http');
    expect(r.blobsDownloaded).toBe(1);
  });

  it('surfaces a wrong token as a clear error, and a dead address as unreachable', async () => {
    const phone = makePeer();
    await expect(runSync(phone.core, createHttpTransport(base, 'bad'))).rejects.toBeInstanceOf(SyncHttpError);
    await expect(runSync(phone.core, createHttpTransport('http://127.0.0.1:1', token))).rejects.toBeInstanceOf(HubUnreachableError);
  });

  it('serves the web app, including deep links with relative asset paths', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('app');
    expect(await (await fetch(`${base}/journal/trades/new`)).text()).toContain('app');
    const asset = await fetch(`${base}/journal/trades/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('console.log(1)');
    expect((await fetch(`${base}/missing.js`)).status).toBe(404);
  });

  it('does not allow path traversal out of the web folder', async () => {
    for (const p of ['/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const r = await fetch(`${base}${p}`);
      expect(await r.text()).not.toContain('top secret');
    }
  });

  it('lists LAN addresses before Tailscale ones and builds a decodable pair code', () => {
    const addrs = listAddresses(47821, {
      eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }],
      tailscale0: [{ family: 'IPv4', internal: false, address: '100.101.102.103' }],
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      apipa: [{ family: 'IPv4', internal: false, address: '169.254.9.9' }],
    });
    expect(addrs.map((a: any) => a.url)).toEqual(['http://192.168.1.20:47821', 'http://100.101.102.103:47821']);
    const code = buildPairCode('abc', ['http://1.2.3.4:5']);
    expect(code.startsWith('tm1.')).toBe(true);
    expect(JSON.parse(Buffer.from(code.slice(4), 'base64url').toString())).toEqual({ v: 1, t: 'abc', u: ['http://1.2.3.4:5'] });
  });

  it('keeps the same token across restarts and can rotate it', async () => {
    const cfgPath = path.join(tmp, 'cfg', 'sync-hub.json');
    const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(saved.token).toBe(token);
    const rotated = hub.rotateToken();
    expect(rotated.token).not.toBe(token);
    expect((await fetch(`${base}/api/sync/ping`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
    token = rotated.token;
  });
});
