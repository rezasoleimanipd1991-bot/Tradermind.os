import {
  SYNC_OVERLAP_MS, type SyncCore, type SyncPayload, type ApplyStats, type Tombstone,
} from '../db/syncCore';
import { blobToBase64, base64ToBlob } from './blobCodec';
import {
  SYNC_PROTOCOL, HUB_ROUTES, SyncHttpError, HubUnreachableError,
  type Transport, type HubOp, type PingResult, type PushResult, type GetBlobResult,
} from './protocol';

export interface SyncReport {
  hubDeviceId: string;
  sent: { rows: number; tombstones: number };
  applied: ApplyStats;
  blobsUploaded: number;
  blobsDownloaded: number;
  blobsFailed: number;
  durationMs: number;
  /** آیا چیزی روی همین دستگاه عوض شد؟ (برای تازه‌سازی صفحه‌ها) */
  localDataChanged: boolean;
}

const ROWS_PER_REQUEST = 300;

const emptyStats = (): ApplyStats => ({ inserted: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 });

/** تکه‌تکه کردن تغییرات تا درخواست‌ها سنگین نشوند */
export function chunkPayload(p: SyncPayload, rowsPerChunk = ROWS_PER_REQUEST): SyncPayload[] {
  const base = { deviceId: p.deviceId, since: p.since, until: p.until };
  const out: SyncPayload[] = [];
  for (const [table, list] of Object.entries(p.rows)) {
    for (let i = 0; i < list.length; i += rowsPerChunk) {
      out.push({ ...base, rows: { [table]: list.slice(i, i + rowsPerChunk) }, tombstones: [] });
    }
  }
  for (let i = 0; i < p.tombstones.length; i += rowsPerChunk * 2) {
    out.push({ ...base, rows: {}, tombstones: p.tombstones.slice(i, i + rowsPerChunk * 2) as Tombstone[] });
  }
  // حتی بدون تغییر هم یک درخواست خالی می‌فرستیم تا مرکز فهرست فایل‌های مورد نیازش را بدهد
  if (out.length === 0) out.push({ ...base, rows: {}, tombstones: [] });
  return out;
}

/** یک دور همگام‌سازی کامل با مرکز: ارسال → دریافت → انتقال فایل‌ها */
export async function runSync(core: SyncCore, transport: Transport): Promise<SyncReport> {
  const t0 = Date.now();

  const ping = await transport.call<PingResult>('ping', undefined, 5_000);
  if (ping.protocol !== SYNC_PROTOCOL) {
    throw new Error('نسخه‌ی برنامه روی گوشی/وب با نسخه‌ی ویندوز یکی نیست؛ هر دو را به‌روزرسانی کنید.');
  }
  const ns = `hub:${ping.hubDeviceId}`;

  // ── ۱) ارسال تغییرات این دستگاه ──────────────────────────────
  const pushSince = await core.getCursor(`${ns}:push`);
  const outgoing = await core.collectChanges(pushSince);
  const sent = {
    rows: Object.values(outgoing.rows).reduce((n, l) => n + l.length, 0),
    tombstones: outgoing.tombstones.length,
  };
  let needBlobs: PushResult['needBlobs'] = [];
  for (const chunk of chunkPayload(outgoing)) {
    const res = await transport.call<PushResult>('push', { payload: chunk }, 120_000);
    if (res.stats.failed > 0) console.warn('[sync] hub reported failed rows', res.stats);
    needBlobs = res.needBlobs;
  }
  await core.setCursor(`${ns}:push`, Math.max(0, outgoing.until - SYNC_OVERLAP_MS));

  // ── ۲) ارسال فایل‌هایی که مرکز لازم دارد ─────────────────────
  let blobsUploaded = 0;
  let blobsFailed = 0;
  for (const ref of needBlobs) {
    try {
      const blob = await core.readBlob(ref.table, ref.key, ref.field);
      if (!blob) continue; // این فایل پیش ما نیست
      await transport.call('putBlob', {
        table: ref.table, key: ref.key, field: ref.field,
        type: blob.type, size: blob.size, base64: await blobToBase64(blob),
      }, 300_000);
      blobsUploaded++;
    } catch (e) {
      console.warn('[sync] blob upload failed', ref, e);
      blobsFailed++;
    }
  }

  // ── ۳) دریافت تغییرات مرکز (جدول به جدول) ────────────────────
  const pullSince = await core.getCursor(`${ns}:pull`);
  const { tables } = await transport.call<{ tables: string[] }>('tables', undefined, 10_000);
  const applied = emptyStats();
  const add = (s: ApplyStats) => {
    applied.inserted += s.inserted; applied.updated += s.updated; applied.deleted += s.deleted;
    applied.skipped += s.skipped; applied.failed += s.failed;
  };
  let minUntil = Infinity;
  for (const table of tables) {
    const res = await transport.call<SyncPayload>('pull', { since: pullSince, tables: [table], tombstones: false }, 120_000);
    minUntil = Math.min(minUntil, res.until);
    if (Object.keys(res.rows).length) add(await core.applyChanges(res));
  }
  const tomb = await transport.call<SyncPayload>('pull', { since: pullSince, tables: [], tombstones: true }, 120_000);
  minUntil = Math.min(minUntil, tomb.until);
  if (tomb.tombstones.length) add(await core.applyChanges(tomb));
  if (Number.isFinite(minUntil)) {
    await core.setCursor(`${ns}:pull`, Math.max(0, minUntil - SYNC_OVERLAP_MS));
  }

  // ── ۴) دریافت فایل‌های ناقص از مرکز ──────────────────────────
  let blobsDownloaded = 0;
  for (const ref of await core.listPendingBlobs()) {
    try {
      const res = await transport.call<GetBlobResult>('getBlob', { table: ref.table, key: ref.key, field: ref.field }, 300_000);
      if (!res.found || !res.blob) continue; // مرکز هم هنوز ندارد
      const ok = await core.writeBlob(ref.table, ref.key, ref.field, base64ToBlob(res.blob.base64, res.blob.type));
      if (ok) blobsDownloaded++;
    } catch (e) {
      console.warn('[sync] blob download failed', ref, e);
      blobsFailed++;
    }
  }

  return {
    hubDeviceId: ping.hubDeviceId,
    sent,
    applied,
    blobsUploaded,
    blobsDownloaded,
    blobsFailed,
    durationMs: Date.now() - t0,
    localDataChanged: applied.inserted + applied.updated + applied.deleted + blobsDownloaded > 0,
  };
}

// ── انتقال HTTP ───────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout(); reject(new HubUnreachableError('پاسخی از نرم‌افزار ویندوز نیامد (timeout)')); }, ms);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

export function createHttpTransport(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async call<T>(op: HubOp, args?: unknown, timeoutMs = 60_000): Promise<T> {
      const route = HUB_ROUTES[op];
      const ctrl = new AbortController();
      const run = async (): Promise<T> => {
        let res: Response;
        try {
          res = await fetchImpl(base + route.path, {
            method: route.method,
            headers: {
              Authorization: `Bearer ${token}`,
              ...(route.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
            },
            body: route.method === 'GET' ? undefined : JSON.stringify(args ?? {}),
            signal: ctrl.signal,
          });
        } catch (e) {
          throw new HubUnreachableError(e instanceof Error ? e.message : undefined);
        }
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* ignore */ }
          throw new SyncHttpError(res.status, msg);
        }
        return (await res.json()) as T;
      };
      return withTimeout(run(), timeoutMs, () => ctrl.abort());
    },
  };
}
