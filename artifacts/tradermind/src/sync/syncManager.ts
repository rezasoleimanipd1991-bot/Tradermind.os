import { useSyncExternalStore } from 'react';
import { syncCore } from '../db/syncEngine';
import { runSync, type SyncReport } from './syncClient';
import { resolveHub } from './hubResolver';
import { HubUnreachableError, SyncHttpError } from './protocol';
import {
  loadSyncConfig, saveSyncConfig, clearSyncConfig, decodePairCode, loadLastResult, saveLastResult,
  normalizeUrl, type SyncConfig, type SyncLastResult,
} from './syncConfig';
import { emitDataSynced } from './dataEvents';

export type SyncPhase = 'unpaired' | 'idle' | 'syncing' | 'ok' | 'unreachable' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  configured: boolean;
  autoSync: boolean;
  lastAttemptAt: number | null;
  lastResult: SyncLastResult | null;
  activeUrl: string | null;
  error: string | null;
}

export type SyncReason = 'manual' | 'start' | 'focus' | 'online' | 'timer' | 'pair';

const AUTO_INTERVAL_MS = 3 * 60_000;
const MIN_GAP_MS = 15_000;   // همگام‌سازی خودکار پشت‌سرهم نشود

let config: SyncConfig | null = loadSyncConfig();
let status: SyncStatus = {
  phase: config ? 'idle' : 'unpaired',
  configured: Boolean(config),
  autoSync: config?.autoSync ?? true,
  lastAttemptAt: null,
  lastResult: loadLastResult(),
  activeUrl: config?.lastGoodUrl ?? null,
  error: null,
};
const listeners = new Set<() => void>();
let inFlight: Promise<SyncOutcome> | null = null;

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach(l => l());
}

export interface SyncOutcome {
  ok: boolean;
  report?: SyncReport;
  unreachable?: boolean;
  error?: string;
}

function describeError(e: unknown): string {
  if (e instanceof SyncHttpError) {
    if (e.status === 401) return 'کد اتصال معتبر نیست. در برنامه‌ی ویندوز کد را دوباره ببینید و اتصال را از نو بزنید.';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export const syncManager = {
  getStatus: () => status,
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  isConfigured: () => Boolean(config),

  /** اتصال با کد؛ اول واقعاً به ویندوز وصل می‌شود تا کد غلط ذخیره نشود */
  async pair(code: string, preferUrls: string[] = []): Promise<void> {
    const decoded = decodePairCode(code);
    if (!decoded) throw new Error('کد اتصال معتبر نیست. کد را کامل از برنامه‌ی ویندوز کپی کنید.');
    const urls = [...preferUrls.map(normalizeUrl), ...decoded.urls].filter((u, i, a) => a.indexOf(u) === i);
    const { url } = await resolveHub({ token: decoded.token, urls }).catch(e => {
      if (e instanceof HubUnreachableError) {
        throw new Error('به نرم‌افزار ویندوز وصل نشد. مطمئن شوید برنامه روی کامپیوتر باز است و گوشی با کامپیوتر در یک شبکه (یا هر دو در Tailscale) هستند.');
      }
      throw new Error(describeError(e));
    });
    config = { token: decoded.token, urls, lastGoodUrl: url, autoSync: true, pairedAt: Date.now() };
    saveSyncConfig(config);
    setStatus({ configured: true, phase: 'idle', autoSync: true, activeUrl: url, error: null });
  },

  disconnect() {
    clearSyncConfig();
    config = null;
    setStatus({ configured: false, phase: 'unpaired', activeUrl: null, lastResult: null, error: null });
  },

  setAutoSync(on: boolean) {
    if (!config) return;
    config = { ...config, autoSync: on };
    saveSyncConfig(config);
    setStatus({ autoSync: on });
  },

  /** نشانگرها را صفر می‌کند تا همه‌چیز دوباره بررسی شود (امن است؛ فقط کندتر) */
  async resetAndSync(): Promise<SyncOutcome> {
    await syncCore.resetCursors('hub:');
    return this.syncNow('manual');
  },

  syncNow(reason: SyncReason = 'manual'): Promise<SyncOutcome> {
    if (!config) return Promise.resolve({ ok: false, error: 'هنوز به نرم‌افزار ویندوز متصل نشده‌اید.' });
    if (inFlight) return inFlight;
    const cfg = config;
    const manual = reason === 'manual' || reason === 'pair';
    if (!manual && !cfg.autoSync) return Promise.resolve({ ok: false, error: 'همگام‌سازی خودکار خاموش است.' });
    if (!manual && status.lastAttemptAt && Date.now() - status.lastAttemptAt < MIN_GAP_MS) {
      return Promise.resolve({ ok: false, error: 'به‌تازگی تلاش شده است.' });
    }

    inFlight = (async (): Promise<SyncOutcome> => {
      setStatus({ phase: 'syncing', lastAttemptAt: Date.now(), error: null });
      try {
        const { url, transport } = await resolveHub(cfg);
        if (url !== cfg.lastGoodUrl) {
          config = { ...cfg, lastGoodUrl: url };
          saveSyncConfig(config);
        }
        const report = await runSync(syncCore, transport);
        const result: SyncLastResult = {
          at: Date.now(),
          rowsSent: report.sent.rows + report.sent.tombstones,
          inserted: report.applied.inserted,
          updated: report.applied.updated,
          deleted: report.applied.deleted,
          blobsUp: report.blobsUploaded,
          blobsDown: report.blobsDownloaded,
        };
        saveLastResult(result);
        setStatus({ phase: 'ok', lastResult: result, activeUrl: url, error: null });
        if (report.localDataChanged) {
          emitDataSynced({
            inserted: report.applied.inserted, updated: report.applied.updated,
            deleted: report.applied.deleted, blobs: report.blobsDownloaded, source: 'pulled',
          });
        }
        return { ok: true, report };
      } catch (e) {
        if (e instanceof HubUnreachableError) {
          setStatus({ phase: 'unreachable', error: null });
          return { ok: false, unreachable: true, error: e.message };
        }
        const message = describeError(e);
        console.warn('[sync] failed', e);
        setStatus({ phase: 'error', error: message });
        return { ok: false, error: message };
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  /** همگام‌سازی خودکار: هنگام باز شدن، برگشتن به برنامه، وصل شدن اینترنت، و هر چند دقیقه */
  start(): () => void {
    const kick = (reason: SyncReason) => { if (config?.autoSync) void this.syncNow(reason); };
    const onVisible = () => { if (document.visibilityState === 'visible') kick('focus'); };
    const onOnline = () => kick('online');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const first = window.setTimeout(() => kick('start'), 1_500);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') kick('timer');
    }, AUTO_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  },
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getStatus, syncManager.getStatus);
}
