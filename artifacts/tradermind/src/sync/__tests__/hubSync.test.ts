// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { createSyncCore, type SyncCore } from '../../db/syncCore';
import { installSyncHooks } from '../../db/syncSupport';
import { createHubHandler } from '../hubHandler';
import { runSync, chunkPayload } from '../syncClient';
import type { Transport } from '../protocol';

const SCHEMA = {
  trades: 'id',
  chartScreenshots: 'id',
  syncTombstones: 'id, table, deletedAt',
  syncMeta: 'key',
};

let counter = 0;
interface Peer { db: Dexie; core: SyncCore }

function makePeer(name: string): Peer {
  const db = new Dexie(`${name}-${++counter}-${Math.random()}`);
  db.version(1).stores(SCHEMA);
  installSyncHooks(db);
  return { db, core: createSyncCore(db) };
}

/** انتقال درون‌حافظه‌ای که مثل HTTP همه‌چیز را از JSON رد می‌کند */
function transportTo(hub: Peer): Transport {
  const handle = createHubHandler(hub.core);
  return {
    async call(op, args) {
      const body = args === undefined ? undefined : JSON.parse(JSON.stringify(args));
      return JSON.parse(JSON.stringify(await handle(op, body)));
    },
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const get = (p: Peer, table: string, id: string) => p.db.table(table).get(id);

describe('hub-and-spoke sync', () => {
  let hub: Peer, phone: Peer, web: Peer;
  let toHub: Transport;

  beforeEach(() => {
    hub = makePeer('hub'); phone = makePeer('phone'); web = makePeer('web');
    toHub = transportTo(hub);
  });

  it('phone → hub → web: an offline phone edit reaches both other devices', async () => {
    await phone.db.table('trades').add({ id: 't1', pair: 'XAUUSD', note: 'from phone' });
    await runSync(phone.core, toHub);
    expect((await get(hub, 'trades', 't1'))?.note).toBe('from phone');

    // وب بعداً (با نشانگر قدیمی‌تر از ویرایش گوشی) همگام می‌شود
    await runSync(web.core, toHub);
    expect((await get(web, 'trades', 't1'))?.note).toBe('from phone');
  });

  it('hub data that the phone has never seen is added to the phone', async () => {
    await hub.db.table('trades').add({ id: 'h1', pair: 'XAUUSD', note: 'from pc' });
    const report = await runSync(phone.core, toHub);
    expect((await get(phone, 'trades', 'h1'))?.note).toBe('from pc');
    expect(report.localDataChanged).toBe(true);
  });

  it('merges data that exists only on one side in both directions', async () => {
    await hub.db.table('trades').add({ id: 'pc-only', note: 'pc' });
    await phone.db.table('trades').add({ id: 'phone-only', note: 'phone' });
    await runSync(phone.core, toHub);
    expect(await get(phone, 'trades', 'pc-only')).toBeTruthy();
    expect(await get(hub, 'trades', 'phone-only')).toBeTruthy();
  });

  it('newer edit wins (last write wins by updatedAt)', async () => {
    await hub.db.table('trades').add({ id: 'c1', note: 'v1' });
    await runSync(phone.core, toHub);
    await sleep(5);
    await phone.db.table('trades').update('c1', { note: 'phone edit' });
    await sleep(5);
    await hub.db.table('trades').update('c1', { note: 'pc edit (newer)' });
    await runSync(phone.core, toHub);
    expect((await get(hub, 'trades', 'c1'))?.note).toBe('pc edit (newer)');
    expect((await get(phone, 'trades', 'c1'))?.note).toBe('pc edit (newer)');
  });

  it('deletes propagate phone → hub → web', async () => {
    await hub.db.table('trades').add({ id: 'd1', note: 'doomed' });
    await runSync(phone.core, toHub);
    await runSync(web.core, toHub);
    expect(await get(web, 'trades', 'd1')).toBeTruthy();

    await sleep(5);
    await phone.db.table('trades').delete('d1');
    await runSync(phone.core, toHub);
    expect(await get(hub, 'trades', 'd1')).toBeUndefined();

    await runSync(web.core, toHub);
    expect(await get(web, 'trades', 'd1')).toBeUndefined();
  });

  it('a delete on the hub reaches the phone', async () => {
    await hub.db.table('trades').add({ id: 'd2', note: 'x' });
    await runSync(phone.core, toHub);
    await sleep(5);
    await hub.db.table('trades').delete('d2');
    await runSync(phone.core, toHub);
    expect(await get(phone, 'trades', 'd2')).toBeUndefined();
  });

  it('is idempotent: a second sync with no changes applies nothing', async () => {
    await phone.db.table('trades').add({ id: 'i1', note: 'x' });
    await runSync(phone.core, toHub);
    const again = await runSync(phone.core, toHub);
    expect(again.localDataChanged).toBe(false);
    expect(again.applied.failed).toBe(0);
    expect(await hub.db.table('trades').count()).toBe(1);
  });

  it('transfers image blobs phone → hub → web', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await phone.db.table('chartScreenshots').add({
      id: 's1', caption: 'chart', imageBlob: new Blob([bytes], { type: 'image/png' }),
    });
    const r1 = await runSync(phone.core, toHub);
    expect(r1.blobsUploaded).toBe(1);
    const onHub = await get(hub, 'chartScreenshots', 's1');
    expect(onHub.imageBlob).toBeInstanceOf(Blob);
    expect(onHub.imageBlob.size).toBe(8);

    const r2 = await runSync(web.core, toHub);
    expect(r2.blobsDownloaded).toBe(1);
    const onWeb = await get(web, 'chartScreenshots', 's1');
    expect(new Uint8Array(await onWeb.imageBlob.arrayBuffer())).toEqual(bytes);
    expect(onWeb.imageBlob.type).toBe('image/png');
  });

  it('a web client that pulled a row before its blob arrived gets the blob later', async () => {
    await phone.db.table('chartScreenshots').add({
      id: 's2', caption: 'late', imageBlob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
    });
    // فقط ردیف برسد، فایل نه
    const { payload } = { payload: await phone.core.collectChanges(0) };
    await createHubHandler(hub.core)('push', { payload });
    await runSync(web.core, toHub);                 // وب ردیف را بدون فایل می‌گیرد
    expect((await get(web, 'chartScreenshots', 's2')).imageBlob).toBeNull();

    await runSync(phone.core, toHub);               // حالا فایل به مرکز می‌رسد
    const r = await runSync(web.core, toHub);       // و وب باید فایل را بگیرد
    expect(r.blobsDownloaded).toBe(1);
    expect((await get(web, 'chartScreenshots', 's2')).imageBlob.size).toBe(3);
  });

  it('syncs large first-time datasets in chunks', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `bulk-${i}`, n: i }));
    await phone.db.table('trades').bulkAdd(rows);
    const payload = await phone.core.collectChanges(0);
    expect(chunkPayload(payload).length).toBeGreaterThan(3);
    await runSync(phone.core, toHub);
    expect(await hub.db.table('trades').count()).toBe(1000);
    await runSync(web.core, toHub);
    expect(await web.db.table('trades').count()).toBe(1000);
  });

  it('does not duplicate or lose data when a device is paired to a different hub', async () => {
    await phone.db.table('trades').add({ id: 'p1', note: 'x' });
    await runSync(phone.core, toHub);
    const otherHub = makePeer('hub2');
    await runSync(phone.core, transportTo(otherHub));
    expect(await get(otherHub, 'trades', 'p1')).toBeTruthy();
  });
});
