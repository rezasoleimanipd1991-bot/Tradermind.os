import type Dexie from 'dexie';
import { runAsRemote, SYNC_META_TABLES } from './syncSupport';

/**
 * هسته‌ی همگام‌سازی (بدون وابستگی به دیتابیس اصلی برنامه).
 *
 * قانون‌ها:
 *  - هر رکورد با `updatedAt` (ساعت دستگاهی که ویرایش کرده) مقایسه می‌شود؛ جدیدتر برنده است.
 *  - رکوردی که از دستگاه دیگر می‌رسد، `updatedAt` اصلی خود را نگه می‌دارد و علاوه بر آن
 *    `syncedAt` (زمان رسیدن به این دستگاه) می‌گیرد. دستگاه مرکزی (نسخه‌ی ویندوز)
 *    با `syncedAt` می‌فهمد چه چیزی را باید به دستگاه‌های دیگر بدهد؛ بدون آن، ویرایشی که
 *    گوشی آفلاین انجام داده و دیرتر رسیده، هرگز به نسخه‌ی وب نمی‌رسید.
 */

/** جدول‌هایی که فیلد Blob دارند */
export const BLOB_FIELDS: Record<string, string[]> = {
  chartScreenshots: ['imageBlob'],
  journalMedia: ['blob'],
};

/** هم‌پوشانی امن بین دو همگام‌سازی؛ تکرار بی‌ضرر است ولی از دست رفتن داده ممکن نیست */
export const SYNC_OVERLAP_MS = 10_000;

export interface Tombstone {
  id: string;
  table: string;
  key: any;
  deletedAt: number;
  /** زمان رسیدن این حذف به این دستگاه (فقط وقتی از دستگاه دیگر آمده) */
  receivedAt?: number;
}

export interface SyncPayload {
  deviceId: string;
  since: number;
  until: number;
  rows: Record<string, any[]>;
  tombstones: Tombstone[];
}

export interface ApplyStats {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
}

export interface PendingBlob {
  table: string;
  key: any;
  field: string;
  size: number;
  type: string;
}

export interface CollectOptions {
  /** true برای دستگاه مرکزی: تغییراتی که از دستگاه‌های دیگر رسیده را هم در نظر بگیر */
  includeReceived?: boolean;
  /** فقط این جدول‌ها (پیش‌فرض: همه) */
  tables?: string[];
  /** حذف‌ها هم برگردانده شوند؟ (پیش‌فرض: بله) */
  tombstones?: boolean;
}

/** حذف Blob از رکوردها قبل از ارسال؛ فقط اندازه و نوع می‌ماند */
export function stripBlobs(table: string, rows: any[]): any[] {
  const fields = BLOB_FIELDS[table];
  if (!fields) return rows;
  return rows.map(r => {
    const out: any = { ...r };
    const info: Record<string, { size: number; type: string }> = {};
    for (const f of fields) {
      if (r[f] instanceof Blob) {
        info[f] = { size: r[f].size, type: r[f].type };
        out[f] = null;
      }
    }
    if (Object.keys(info).length) out.__blobs = info;
    return out;
  });
}

/** رکورد دریافتی را برای ذخیره آماده می‌کند؛ Blob محلی تا رسیدن فایل جدید حفظ می‌شود */
export function prepareRow(table: string, row: any, local: any, now: number = Date.now()): any {
  const { __blobs, ...clean } = row;
  for (const f of BLOB_FIELDS[table] ?? []) {
    clean[f] = local?.[f] instanceof Blob ? local[f] : null;
  }
  clean.syncedAt = now;
  return clean;
}

const pendingKey = (t: string, k: any, f: string) => `pendingBlob:${t}:${String(k)}:${f}`;

export function createSyncCore(db: Dexie) {
  const meta = () => db.table('syncMeta');
  const tombTable = () => db.table('syncTombstones');

  const syncableTables = () => db.tables.filter(t => !SYNC_META_TABLES.includes(t.name));

  async function getDeviceId(): Promise<string> {
    const rec = await meta().get('deviceId');
    if (rec?.value) return rec.value as string;
    const id = crypto.randomUUID();
    await meta().put({ key: 'deviceId', value: id });
    return id;
  }

  async function getCursor(name: string): Promise<number> {
    const rec = await meta().get(`cursor:${name}`);
    return typeof rec?.value === 'number' ? rec.value : 0;
  }

  async function setCursor(name: string, ts: number): Promise<void> {
    await meta().put({ key: `cursor:${name}`, value: ts });
  }

  async function resetCursors(prefix = ''): Promise<void> {
    const items = await meta().where('key').startsWith(`cursor:${prefix}`).primaryKeys();
    await meta().bulkDelete(items);
  }

  /** همه تغییرات (رکورد + حذف) بعد از زمان since */
  async function collectChanges(since: number, opts: CollectOptions = {}): Promise<SyncPayload> {
    const until = Date.now();
    const received = opts.includeReceived === true;
    const stamp = (r: any): number =>
      received ? Math.max(r.updatedAt ?? 0, r.syncedAt ?? 0) : (r.updatedAt ?? 0);

    const rows: Record<string, any[]> = {};
    for (const t of syncableTables()) {
      if (opts.tables && !opts.tables.includes(t.name)) continue;
      const list = await t
        .filter((r: any) => typeof r.updatedAt === 'number' && stamp(r) > since)
        .toArray();
      if (list.length) rows[t.name] = stripBlobs(t.name, list);
    }

    let tombstones: Tombstone[] = [];
    if (opts.tombstones !== false) {
      tombstones = (await tombTable()
        .filter((tb: Tombstone) =>
          (received ? Math.max(tb.deletedAt, tb.receivedAt ?? 0) : tb.deletedAt) > since)
        .toArray()) as Tombstone[];
    }
    return { deviceId: await getDeviceId(), since, until, rows, tombstones };
  }

  /** ادغام تغییرات دستگاه دیگر؛ قانون: updatedAt جدیدتر برنده است */
  async function applyChanges(payload: SyncPayload): Promise<ApplyStats> {
    const stats: ApplyStats = { inserted: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 };
    const now = Date.now();

    await runAsRemote(async () => {
      await db.transaction('rw', db.tables, async () => {
        // ۱) رکوردها
        for (const [name, list] of Object.entries(payload.rows ?? {})) {
          if (SYNC_META_TABLES.includes(name)) continue;
          const table = db.tables.find(t => t.name === name);
          if (!table) { stats.skipped += list.length; continue; }
          const keyPath = table.schema.primKey.keyPath as string;

          for (const row of list) {
            try {
              const key = row[keyPath];
              if (key === undefined || typeof row.updatedAt !== 'number') { stats.skipped++; continue; }
              const tomb = (await tombTable().get(`${name}:${String(key)}`)) as Tombstone | undefined;
              if (tomb && tomb.deletedAt >= row.updatedAt) { stats.skipped++; continue; }

              const local = await table.get(key);
              if (!local) {
                await table.put(prepareRow(name, row, local, now));
                await markPendingBlobsIn(name, key, row, local);
                stats.inserted++;
              } else if ((local.updatedAt ?? 0) < row.updatedAt) {
                await table.put(prepareRow(name, row, local, now));
                await markPendingBlobsIn(name, key, row, local);
                stats.updated++;
              } else {
                // همان نسخه از رکورد: اگر فایلش بعداً رسیده باشد، باید در فهرست انتظار برود
                if ((local.updatedAt ?? 0) === row.updatedAt) {
                  await markPendingBlobsIn(name, key, row, local);
                }
                stats.skipped++;
                continue;
              }
              if (tomb) await tombTable().delete(tomb.id); // رکورد زنده‌تر از حذف قدیمی است
            } catch (e) {
              console.warn('[sync] row failed', name, e);
              stats.failed++;
            }
          }
        }

        // ۲) حذف‌ها
        for (const tomb of payload.tombstones ?? []) {
          const table = db.tables.find(t => t.name === tomb.table);
          if (!table || SYNC_META_TABLES.includes(tomb.table)) { stats.skipped++; continue; }
          try {
            const local = await table.get(tomb.key);
            if (local && (local.updatedAt ?? 0) > tomb.deletedAt) { stats.skipped++; continue; }
            const existing = (await tombTable().get(tomb.id)) as Tombstone | undefined;
            if (local) { await table.delete(tomb.key); stats.deleted++; }
            if (!existing || existing.deletedAt < tomb.deletedAt) {
              await tombTable().put({ ...tomb, receivedAt: now });
            } else if (!local) {
              stats.skipped++;
            }
          } catch (e) {
            console.warn('[sync] tombstone failed', tomb.id, e);
            stats.failed++;
          }
        }
      });
    });

    return stats;
  }

  // ── Blob ها ────────────────────────────────────────────────────

  /** فایل‌هایی که باید از دستگاه مقابل گرفته شوند را در فهرست انتظار ثبت می‌کند */
  async function markPendingBlobsIn(table: string, key: any, row: any, local: any): Promise<void> {
    const info = row.__blobs as Record<string, { size: number; type: string }> | undefined;
    if (!info) return;
    for (const [field, m] of Object.entries(info)) {
      const have = local?.[field];
      if (have instanceof Blob && have.size === m.size && have.type === m.type) continue;
      await meta().put({
        key: pendingKey(table, key, field),
        value: { table, key, field, size: m.size, type: m.type } as PendingBlob,
      });
    }
  }

  async function listPendingBlobs(): Promise<PendingBlob[]> {
    const items = await meta().where('key').startsWith('pendingBlob:').toArray();
    return items.map((i: any) => i.value as PendingBlob);
  }

  /** خواندن فایل برای ارسال به دستگاه مقابل */
  async function readBlob(table: string, key: any, field: string): Promise<Blob | null> {
    if (!BLOB_FIELDS[table]?.includes(field)) return null;
    const r = await db.table(table).get(key);
    return r?.[field] instanceof Blob ? r[field] : null;
  }

  /**
   * ذخیره فایل دریافتی بدون تغییر updatedAt.
   * syncedAt عمداً به‌روز می‌شود تا دستگاه مرکزی در همگام‌سازی بعدی، رکورد (حالا با فایل) را
   * دوباره به دستگاه‌های دیگر بدهد.
   */
  async function writeBlob(table: string, key: any, field: string, blob: Blob): Promise<boolean> {
    if (!BLOB_FIELDS[table]?.includes(field)) return false;
    let written = false;
    await runAsRemote(async () => {
      const n = await db.table(table).update(key, { [field]: blob, syncedAt: Date.now() });
      written = n > 0;
    });
    // اگر رکورد (دیگر) وجود ندارد هم از فهرست انتظار پاک می‌شود
    await meta().delete(pendingKey(table, key, field));
    return written;
  }

  return {
    getDeviceId, getCursor, setCursor, resetCursors,
    collectChanges, applyChanges,
    listPendingBlobs, readBlob, writeBlob,
    syncableTableNames: () => syncableTables().map(t => t.name),
  };
}

export type SyncCore = ReturnType<typeof createSyncCore>;
