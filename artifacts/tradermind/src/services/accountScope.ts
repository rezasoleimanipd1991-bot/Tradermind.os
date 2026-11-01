/**
 * accountScope.ts — منطق خالص «کدام معاملات در تحلیل می‌آیند»
 *
 * انتخاب کاربر برای صفحه‌های تحلیلی سه حالت دارد:
 *  - یک حساب مشخص (accountId)                       → فقط معاملات همان حساب
 *  - COMBINED_ACCOUNTS_ID («همه‌ی حساب‌ها، ترکیبی») → معاملات همه‌ی حساب‌ها با هم
 *  - null («همه‌ی حساب‌ها، جداگانه»)                   → برای هر حساب یک کارت جدا
 *
 * ترکیب‌کردن فقط وقتی مجاز است که جمع‌زدن اعداد معنی داشته باشد: همه‌ی معاملات به یک حساب
 * شناخته‌شده وصل باشند و همه‌ی حساب‌ها ارز یکسان داشته باشند. در غیر این صورت (مثلاً USD و EUR)
 * جمع پول بی‌معنی است و فقط نمای جداگانه/تک‌حساب مجاز می‌ماند.
 */
import type { Account, Trade } from '../db/database';

export const COMBINED_ACCOUNTS_ID = '__combined__';

export interface CombinedScopeInfo {
  allowed: boolean;
  /** ارز مشترک وقتی ترکیب مجاز است (null اگر هیچ حساب شناخته‌شده‌ای نباشد) */
  currency: string | null;
  /** دلیل غیرفعال‌بودن ترکیب (برای نمایش به کاربر) */
  reason: string | null;
  /** هشدار غیرمسدودکننده (مثلاً معاملات بدون حساب که در ترکیب آمده‌اند) */
  warning: string | null;
}

export function getCombinedScopeInfo(accounts: Account[], trades: Trade[]): CombinedScopeInfo {
  if (!trades.length) return { allowed: true, currency: null, reason: null, warning: null };

  const byId = new Map(accounts.map(account => [account.id, account]));
  const usedIds = new Set<string>();
  let unknown = 0;
  for (const trade of trades) {
    if (trade.accountId && byId.has(trade.accountId)) usedIds.add(trade.accountId);
    else unknown++;
  }

  const currencies = new Set([...usedIds].map(id => byId.get(id)!.currency));
  if (currencies.size > 1) {
    return {
      allowed: false,
      currency: null,
      reason: `حساب‌ها ارزهای متفاوت دارند (${[...currencies].join('، ')}) و جمع‌زدن‌شان بی‌معنی است.`,
      warning: null,
    };
  }
  return {
    allowed: true,
    currency: [...currencies][0] ?? null,
    reason: null,
    warning: unknown ? `${unknown} معامله به حساب مشخصی وصل نیست و در جمع ترکیبی آمده است.` : null,
  };
}

/** معاملاتی که با انتخاب فعلی باید تحلیل شوند. null (جداگانه) هیچ‌چیز برنمی‌گرداند؛ نما کارت‌های جدا است. */
export function scopeTrades(
  trades: Trade[],
  selectedAccountId: string | null,
  combined: CombinedScopeInfo,
): Trade[] {
  if (selectedAccountId === null) return [];
  if (selectedAccountId === COMBINED_ACCOUNTS_ID) return combined.allowed ? trades : [];
  return trades.filter(trade => trade.accountId === selectedAccountId);
}

/** سرمایه‌ی اولیه‌ی ترکیبی: جمع سرمایه‌ی اولیه‌ی حساب‌های درگیر؛ null اگر یکی نامعلوم باشد. */
export function sumInitialBalances(accounts: Account[], trades: Trade[]): number | null {
  const usedIds = new Set(trades.map(trade => trade.accountId).filter((id): id is string => Boolean(id)));
  if (!usedIds.size) return null;
  let total = 0;
  for (const id of usedIds) {
    const account = accounts.find(item => item.id === id);
    const balance = account?.initialBalance;
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance <= 0) return null;
    total += balance;
  }
  return total;
}
