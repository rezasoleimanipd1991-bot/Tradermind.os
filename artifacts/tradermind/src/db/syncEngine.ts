import { db } from './database';
import { createSyncCore } from './syncCore';

export type { Tombstone, SyncPayload, ApplyStats, CollectOptions } from './syncCore';
export { SYNC_OVERLAP_MS } from './syncCore';

/** موتور همگام‌سازیِ متصل به دیتابیس اصلی برنامه */
export const syncCore = createSyncCore(db);

export const {
  getDeviceId, getCursor, setCursor, resetCursors, collectChanges, applyChanges,
} = syncCore;
