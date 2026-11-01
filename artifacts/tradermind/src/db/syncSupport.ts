import Dexie, { Transaction } from 'dexie';

/** جدول‌های داخلی همگام‌سازی که خودشان همگام نمی‌شوند */
export const SYNC_META_TABLES = ['syncTombstones', 'syncMeta'];

let applyingRemote = 0;

/** تغییراتی که از دستگاه دیگر می‌آیند باید updatedAt اصلی خود را نگه دارند */
export async function runAsRemote<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemote++;
  try {
    return await fn();
  } finally {
    applyingRemote--;
  }
}

export function installSyncHooks(db: Dexie) {
  for (const table of db.tables) {
    const name = table.name;
    if (SYNC_META_TABLES.includes(name)) continue;

    table.hook('creating', (_pk: any, obj: any) => {
      if (applyingRemote === 0) obj.updatedAt = Date.now();
    });

    table.hook('updating', (mods: any) => {
      if (applyingRemote === 0 && !('updatedAt' in mods)) {
        return { updatedAt: Date.now() };
      }
      return undefined;
    });

    table.hook('deleting', function (this: any, pk: any) {
      if (applyingRemote > 0) return;
      this.onsuccess = () => {
        Dexie.ignoreTransaction(() => {
          db.table('syncTombstones').put({
            id: `${name}:${String(pk)}`,
            table: name,
            key: pk,
            deletedAt: Date.now(),
          });
        });
      };
    });
  }
}

export async function backfillUpdatedAt(tx: Transaction, names: string[]) {
  const now = Date.now();
  for (const name of names) {
    if (SYNC_META_TABLES.includes(name)) continue;
    await tx.table(name).toCollection().modify((r: any) => {
      if (typeof r.updatedAt !== 'number') {
        r.updatedAt = typeof r.createdAt === 'number' ? r.createdAt : now;
      }
    });
  }
}
