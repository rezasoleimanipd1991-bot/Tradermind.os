import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { onDataSynced, type DataSyncedDetail } from './dataEvents';
import { registerDesktopHub, getDesktopApi } from './desktopBridge';
import { syncManager } from './syncManager';

const PAIR_HASH_RE = /[#&]pair=([^&]+)/;

/**
 * بدون ظاهر. کارهای زمینه‌ای همگام‌سازی را راه می‌اندازد:
 *  - ویندوز: پاسخ‌دهی به درخواست‌های گوشی و وب
 *  - گوشی/وب: همگام‌سازی خودکار با ویندوز + پذیرش لینک اتصال (#pair=…)
 *  - هر دو: اطلاع‌رسانی و تازه‌سازی وقتی داده‌ی جدید رسید
 */
export function SyncRuntime() {
  const queryClient = useQueryClient();

  // رسیدن داده‌ی جدید → باطل کردن کش + اطلاع‌رسانی (بدون پریدن صفحه وسط ویرایش)
  useEffect(() => {
    let acc: DataSyncedDetail | null = null;
    let timer: number | undefined;

    const flush = () => {
      if (!acc) return;
      const n = acc.inserted + acc.updated + acc.deleted + acc.blobs;
      const text = acc.source === 'received'
        ? `${n} مورد از گوشی یا نسخه‌ی وب به این برنامه رسید`
        : `${n} مورد جدید از نرم‌افزار ویندوز دریافت شد`;
      acc = null;
      void queryClient.invalidateQueries();
      toast.success(text, {
        duration: 9000,
        action: { label: 'تازه‌سازی صفحه', onClick: () => window.location.reload() },
      });
    };

    const off = onDataSynced(d => {
      acc = acc
        ? { ...d, inserted: acc.inserted + d.inserted, updated: acc.updated + d.updated,
            deleted: acc.deleted + d.deleted, blobs: acc.blobs + d.blobs }
        : d;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 1500);
    });
    return () => { off(); window.clearTimeout(timer); };
  }, [queryClient]);

  useEffect(() => {
    if (getDesktopApi()) {
      registerDesktopHub();
      return;
    }

    // لینک «باز کردن نسخه‌ی وب» از برنامه‌ی ویندوز: http://127.0.0.1:PORT/#pair=…
    const m = PAIR_HASH_RE.exec(window.location.hash);
    if (m && /^https?:$/.test(window.location.protocol)) {
      const code = decodeURIComponent(m[1]);
      const clean = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
      syncManager.pair(code, [window.location.origin])
        .then(() => { toast.success('به نرم‌افزار ویندوز وصل شد'); void syncManager.syncNow('pair'); })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'اتصال انجام نشد'))
        .finally(clean);
    }

    return syncManager.start();
  }, []);

  return null;
}
