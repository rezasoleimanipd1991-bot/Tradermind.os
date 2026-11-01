import type { SyncCore, SyncPayload } from '../db/syncCore';
import { blobToBase64, base64ToBlob } from './blobCodec';
import {
  SYNC_PROTOCOL, type PingResult, type PushResult, type GetBlobResult, type PutBlobResult,
} from './protocol';

export interface HubHandlerOptions {
  /** وقتی داده‌ی این دستگاه (مرکز) از بیرون تغییر کرد صدا زده می‌شود */
  onDataChanged?: (info: { inserted: number; updated: number; deleted: number; blobs: number }) => void;
}

function assertObject(v: unknown, what: string): asserts v is Record<string, any> {
  if (!v || typeof v !== 'object') throw new Error(`invalid ${what}`);
}

/**
 * پردازشگر درخواست‌ها در سمت «مرکز» (برنامه‌ی ویندوز).
 * درخواست‌های گوشی/وب از سرور داخلی Electron به اینجا می‌رسد و روی دیتابیس واقعی برنامه اجرا می‌شود.
 */
export function createHubHandler(core: SyncCore, opts: HubHandlerOptions = {}) {
  return async function handle(op: string, args: any): Promise<unknown> {
    switch (op) {
      case 'ping': {
        const r: PingResult = {
          ok: true, protocol: SYNC_PROTOCOL, hubDeviceId: await core.getDeviceId(), time: Date.now(),
        };
        return r;
      }

      case 'tables':
        return { tables: core.syncableTableNames() };

      case 'push': {
        assertObject(args, 'args');
        const payload = args.payload as SyncPayload;
        assertObject(payload, 'payload');
        const stats = await core.applyChanges(payload);
        if (stats.inserted + stats.updated + stats.deleted > 0) {
          opts.onDataChanged?.({ inserted: stats.inserted, updated: stats.updated, deleted: stats.deleted, blobs: 0 });
        }
        const r: PushResult = { stats, needBlobs: await core.listPendingBlobs() };
        return r;
      }

      case 'pull': {
        assertObject(args, 'args');
        const since = Number(args.since);
        if (!Number.isFinite(since) || since < 0) throw new Error('invalid since');
        const tables = Array.isArray(args.tables) ? args.tables.map(String) : undefined;
        return core.collectChanges(since, {
          includeReceived: true,
          tables,
          tombstones: args.tombstones !== false,
        });
      }

      case 'getBlob': {
        assertObject(args, 'args');
        const blob = await core.readBlob(String(args.table), args.key, String(args.field));
        if (!blob) { const r: GetBlobResult = { found: false }; return r; }
        const r: GetBlobResult = {
          found: true,
          blob: {
            table: String(args.table), key: args.key, field: String(args.field),
            type: blob.type, size: blob.size, base64: await blobToBase64(blob),
          },
        };
        return r;
      }

      case 'putBlob': {
        assertObject(args, 'args');
        if (typeof args.base64 !== 'string') throw new Error('invalid blob');
        const blob = base64ToBlob(args.base64, String(args.type ?? ''));
        const written = await core.writeBlob(String(args.table), args.key, String(args.field), blob);
        if (written) opts.onDataChanged?.({ inserted: 0, updated: 0, deleted: 0, blobs: 1 });
        const r: PutBlobResult = { written };
        return r;
      }

      default:
        throw new Error(`unknown op: ${op}`);
    }
  };
}
