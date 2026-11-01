/** رویدادی که بعد از رسیدن داده‌ی جدید از دستگاه دیگر ارسال می‌شود تا صفحه‌ها تازه شوند */

export const DATA_SYNCED_EVENT = 'tradermind:data-synced';

export interface DataSyncedDetail {
  inserted: number;
  updated: number;
  deleted: number;
  blobs: number;
  /** مبدأ تغییر: دریافت از ویندوز یا رسیدن از گوشی/وب */
  source: 'pulled' | 'received';
}

export function emitDataSynced(detail: DataSyncedDetail): void {
  window.dispatchEvent(new CustomEvent<DataSyncedDetail>(DATA_SYNCED_EVENT, { detail }));
}

export function onDataSynced(cb: (d: DataSyncedDetail) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<DataSyncedDetail>).detail);
  window.addEventListener(DATA_SYNCED_EVENT, handler);
  return () => window.removeEventListener(DATA_SYNCED_EVENT, handler);
}
