import { createHttpTransport } from './syncClient';
import { HubUnreachableError, SyncHttpError, type Transport } from './protocol';
import type { SyncConfig } from './syncConfig';

export const PING_TIMEOUT_MS = 3_500;

/** اولین آدرسی که جواب می‌دهد؛ آدرسِ آخرین موفقیت اول امتحان می‌شود */
export async function resolveHub(
  cfg: Pick<SyncConfig, 'token' | 'urls' | 'lastGoodUrl'>,
  makeTransport: (url: string, token: string) => Transport = createHttpTransport,
): Promise<{ url: string; transport: Transport }> {
  const order = [cfg.lastGoodUrl, ...cfg.urls].filter((u): u is string => Boolean(u));
  const tried = new Set<string>();
  for (const url of order) {
    if (tried.has(url)) continue;
    tried.add(url);
    const transport = makeTransport(url, cfg.token);
    try {
      await transport.call('ping', undefined, PING_TIMEOUT_MS);
      return { url, transport };
    } catch (e) {
      // کد اشتباه با آدرس دیگر هم درست نمی‌شود
      if (e instanceof SyncHttpError && (e.status === 401 || e.status === 403)) throw e;
    }
  }
  throw new HubUnreachableError();
}

