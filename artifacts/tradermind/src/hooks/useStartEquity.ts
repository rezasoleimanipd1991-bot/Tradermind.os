/**
 * useStartEquity.ts — سرمایه‌ی شروع بازه برای محاسبه‌ی درصد Drawdown
 *
 * = مجموع سرمایه‌ی اولیه‌ی حساب‌های مربوط + P/L خالص معاملات پیش از اولین معامله‌ی بازه.
 * اگر سرمایه‌ی اولیه‌ی حساب ثبت نشده باشد null برمی‌گرداند (درصد نمایش داده نمی‌شود).
 */
import { useEffect, useMemo, useState } from 'react';
import type { Account, Trade } from '../db/database';
import { accountService } from '../services/accountService';
import { resolveStartEquity } from '../core/metrics/drawdown';

export function useStartEquity(allTrades: Trade[], periodTrades: Trade[] = allTrades): number | null {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    let cancelled = false;
    accountService.getAll().then(a => { if (!cancelled) setAccounts(a); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => resolveStartEquity(accounts, allTrades, periodTrades), [accounts, allTrades, periodTrades]);
}
