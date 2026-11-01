import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Account, Trade } from '../db/database';
import { accountService } from '../services/accountService';
import { tradeService } from '../services/tradeService';
import { isClosed } from '../lib/tradeHelpers';
import {
  computeMetrics,
  computeMetricsBy,
  getMetricExtremesBy,
  rankMetricGroups,
  type TradeMetrics,
} from '../core/metrics/engine';
import {
  getTradingDateKey,
  getTradingDateParts,
  getTradingIsoWeekKey,
  getTradingMonthKey,
} from '../lib/tradingTime';
import { useAppStore } from '../store/useAppStore';
import { useLocation } from 'wouter';
import {
  COMBINED_ACCOUNTS_ID,
  getCombinedScopeInfo,
  scopeTrades,
  sumInitialBalances,
  type CombinedScopeInfo,
} from '../services/accountScope';

const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

export interface PeriodMetricExtremes {
  label: string;
  bestPeriod: string | null;
  bestPnl: number | null;
  worstPeriod: string | null;
  worstPnl: number | null;
}

export interface AccountAnalyticsSummary {
  accountId: string | null;
  accountName: string;
  currency: string | null;
  metrics: TradeMetrics;
  bestDay: string | null;
  worstDay: string | null;
  bestHour: number | null;
  worstHour: number | null;
  periods: PeriodMetricExtremes[];
}

interface AccountAnalyticsContextValue {
  accounts: Account[];
  selectedAccountId: string | null;
  setSelectedAccountId: (accountId: string | null) => void;
  selectedAccount: Account | null;
  /** آیا «همه‌ی حساب‌ها، ترکیبی» انتخاب شده و مجاز است */
  combinedSelected: boolean;
  /** اطلاعات مجاز/غیرمجاز‌بودن نمای ترکیبی (ارز یکسان و ...) */
  combined: CombinedScopeInfo;
  /** true = به‌جای صفحه، کارت‌های جداگانه‌ی حساب‌ها نشان داده شود */
  separateView: boolean;
  /** خلاصه‌ی حساب انتخاب‌شده یا خلاصه‌ی ترکیبی؛ null در نمای جداگانه */
  selectedSummary: AccountAnalyticsSummary | null;
  summaries: AccountAnalyticsSummary[];
  loading: boolean;
  error: string | null;
}

const AccountAnalyticsContext = createContext<AccountAnalyticsContextValue | null>(null);

function getPeriodExtremes(
  trades: Trade[],
  label: string,
  keyFn: (trade: Trade) => string,
): PeriodMetricExtremes {
  const groups = computeMetricsBy(
    trades,
    trade => isClosed(trade) ? keyFn(trade) : null,
  );
  const ranked = rankMetricGroups(groups, 'netPnl');
  // با فقط یک بازه، «بهترین» و «ضعیف‌ترین» یکی می‌شود؛ ضعیف‌ترین را خالی بگذار
  const best = ranked.best;
  const worst = ranked.worst && best && ranked.worst.key === best.key ? null : ranked.worst;
  return {
    label,
    bestPeriod: best ? String(best.key) : null,
    bestPnl: best?.metrics.netPnl ?? null,
    worstPeriod: worst ? String(worst.key) : null,
    worstPnl: worst?.metrics.netPnl ?? null,
  };
}

function summarizeAccount(
  accountId: string | null,
  accountName: string,
  currency: string | null,
  trades: Trade[],
  startBalance: number | null,
): AccountAnalyticsSummary {
  const bestDay = getMetricExtremesBy(
    trades,
    trade => isClosed(trade) ? getTradingDateParts(trade.openedAt).dayOfWeek : null,
    'avgR',
    3,
  );
  const bestHour = getMetricExtremesBy(
    trades,
    trade => isClosed(trade) ? getTradingDateParts(trade.openedAt).hour : null,
    'avgR',
    3,
  );

  return {
    accountId,
    accountName,
    currency,
    metrics: computeMetrics(trades, { startBalance }),
    bestDay: bestDay.best ? WEEKDAYS[Number(bestDay.best.key)] : null,
    worstDay: bestDay.worst && bestDay.worst.key !== bestDay.best?.key ? WEEKDAYS[Number(bestDay.worst.key)] : null,
    bestHour: bestHour.best ? Number(bestHour.best.key) : null,
    worstHour: bestHour.worst && bestHour.worst.key !== bestHour.best?.key ? Number(bestHour.worst.key) : null,
    periods: [
      getPeriodExtremes(trades, 'روز', trade => getTradingDateKey(trade.closedAt ?? trade.openedAt)),
      getPeriodExtremes(trades, 'هفته', trade => getTradingIsoWeekKey(trade.closedAt ?? trade.openedAt)),
      getPeriodExtremes(trades, 'ماه', trade => getTradingMonthKey(trade.closedAt ?? trade.openedAt)),
      getPeriodExtremes(trades, 'سال', trade => String(getTradingDateParts(trade.closedAt ?? trade.openedAt).year)),
    ],
  };
}

export function AccountAnalyticsProvider({ children }: { children: ReactNode }) {
  const selectedAccountId = useAppStore(state => state.analyticsAccountId);
  const setSelectedAccountId = useAppStore(state => state.setAnalyticsAccountId);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location] = useLocation();
  const hasLoadedRef = useRef(false);

  // داده‌ها با هر تغییر صفحه دوباره خوانده می‌شوند تا بعد از ثبت/ویرایش معامله کهنه نمانند
  useEffect(() => {
    let cancelled = false;
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    Promise.all([accountService.getAll(), tradeService.getAllTrades()])
      .then(([loadedAccounts, loadedTrades]) => {
        if (cancelled) return;
        setAccounts(loadedAccounts);
        setTrades(loadedTrades);
        hasLoadedRef.current = true;
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'بارگذاری حساب‌ها و معاملات ناموفق بود.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [location]);

  useEffect(() => {
    if (selectedAccountId && selectedAccountId !== COMBINED_ACCOUNTS_ID && accounts.length && !accounts.some(account => account.id === selectedAccountId)) {
      setSelectedAccountId(null);
    }
  }, [accounts, selectedAccountId, setSelectedAccountId]);

  const summaries = useMemo(() => {
    const byId = new Map(accounts.map(account => [account.id, account]));
    const rows = accounts.map(account => summarizeAccount(
      account.id,
      account.name,
      account.currency,
      trades.filter(trade => trade.accountId === account.id),
      account.initialBalance,
    ));
    const orphanIds = [...new Set(
      trades.map(trade => trade.accountId).filter((id): id is string => Boolean(id) && !byId.has(id!)),
    )];
    for (const orphanId of orphanIds) {
      rows.push(summarizeAccount(
        orphanId,
        `حساب ثبت‌نشده (${orphanId.slice(0, 8)})`,
        null,
        trades.filter(trade => trade.accountId === orphanId),
        null,
      ));
    }
    const unassigned = trades.filter(trade => !trade.accountId);
    if (unassigned.length) {
      rows.push(summarizeAccount(null, 'حساب نامشخص', null, unassigned, null));
    }
    return rows;
  }, [accounts, trades]);

  const combined = useMemo(() => getCombinedScopeInfo(accounts, trades), [accounts, trades]);
  const combinedSelected = selectedAccountId === COMBINED_ACCOUNTS_ID && combined.allowed;
  const separateView = selectedAccountId === null || (selectedAccountId === COMBINED_ACCOUNTS_ID && !combined.allowed);

  const selectedSummary = useMemo<AccountAnalyticsSummary | null>(() => {
    if (separateView) return null;
    if (combinedSelected) {
      return summarizeAccount(
        COMBINED_ACCOUNTS_ID,
        'همهٔ حساب‌ها (ترکیبی)',
        combined.currency,
        trades,
        sumInitialBalances(accounts, trades),
      );
    }
    return summaries.find((row: AccountAnalyticsSummary) => row.accountId === selectedAccountId) ?? null;
  }, [separateView, combinedSelected, combined.currency, trades, accounts, summaries, selectedAccountId]);

  const value = useMemo<AccountAnalyticsContextValue>(() => ({
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount: accounts.find(account => account.id === selectedAccountId) ?? null,
    combinedSelected,
    combined,
    separateView,
    selectedSummary,
    summaries,
    loading,
    error,
  }), [accounts, selectedAccountId, setSelectedAccountId, combinedSelected, combined, separateView, selectedSummary, summaries, loading, error]);

  return <AccountAnalyticsContext.Provider value={value}>{children}</AccountAnalyticsContext.Provider>;
}

function useAccountAnalyticsContext() {
  const value = useContext(AccountAnalyticsContext);
  if (!value) throw new Error('AccountAnalyticsProvider must wrap analytics routes.');
  return value;
}

export function useAccountAnalyticsScope(trades: Trade[]) {
  const context = useAccountAnalyticsContext();
  const scopedTrades = useMemo(
    () => scopeTrades(trades, context.selectedAccountId, context.combined),
    [trades, context.selectedAccountId, context.combined],
  );
  return { ...context, scopedTrades, allAccountsSelected: context.separateView };
}

export function useAccountAnalyticsSettings() {
  return useAccountAnalyticsContext();
}
