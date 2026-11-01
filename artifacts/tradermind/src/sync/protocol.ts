import type { ApplyStats, PendingBlob } from '../db/syncCore';

/** نسخه‌ی پروتکل؛ اگر ناسازگار شد عدد را بالا ببرید */
export const SYNC_PROTOCOL = 1;

export type HubOp = 'ping' | 'tables' | 'push' | 'pull' | 'getBlob' | 'putBlob';

/** مسیر HTTP هر عملیات (در desktop/syncHub.cjs هم عیناً تکرار شده است) */
export const HUB_ROUTES: Record<HubOp, { method: 'GET' | 'POST' | 'PUT'; path: string }> = {
  ping:    { method: 'GET',  path: '/api/sync/ping' },
  tables:  { method: 'GET',  path: '/api/sync/tables' },
  push:    { method: 'POST', path: '/api/sync/push' },
  pull:    { method: 'POST', path: '/api/sync/pull' },
  getBlob: { method: 'POST', path: '/api/sync/blob/get' },
  putBlob: { method: 'PUT',  path: '/api/sync/blob' },
};

export interface BlobRef { table: string; key: any; field: string }

export interface BlobBody extends BlobRef {
  type: string;
  size: number;
  base64: string;
}

export interface PingResult { ok: true; protocol: number; hubDeviceId: string; time: number }
export interface PushResult { stats: ApplyStats; needBlobs: PendingBlob[] }
export interface GetBlobResult { found: boolean; blob?: BlobBody }
export interface PutBlobResult { written: boolean }

export interface Transport {
  call<T = any>(op: HubOp, args?: unknown, timeoutMs?: number): Promise<T>;
}

export class SyncHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

export class HubUnreachableError extends Error {
  constructor(message = 'نرم‌افزار ویندوز در دسترس نیست') {
    super(message);
    this.name = 'HubUnreachableError';
  }
}
