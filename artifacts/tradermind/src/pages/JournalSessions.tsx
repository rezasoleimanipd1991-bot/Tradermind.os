import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpLeft, CalendarDays, CircleAlert, Layers3, Pin, PinOff, Plus, Search, Target } from 'lucide-react';
import { toast } from 'sonner';
import { accountService } from '../services/accountService';
import { journalSessionService, parseJournalArray } from '../services/journalSessionService';
import { strategyService } from '../services/strategyService';
import {
  getJournalSessionDefaults,
  setJournalSessionDefault,
  type JournalSessionDefaultKey,
  type JournalSessionDefaults,
} from '../services/journalSessionDefaults';
import { describeSessionMoment, detectSessionKind, findSessionTypeOptionId, formatDualDateTime, sessionKindLabel } from '../lib/sessionDateTime';
import { isTradingBoxAvailableForAccount, tradingBoxService } from '../services/tradingBoxService';
import type { Account, JournalOption, JournalSession, Strategy, TradingBox } from '../db/database';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/textarea';

const dateTimeLocal = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

type SessionForm = {
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  startTime: string;
  symbol: string;
  marketOptionId: string;
  sessionTypeOptionId: string;
  notes: string;
  tags: string;
  preTradePsychologyOptionIds: string[];
};
const freshForm = (): SessionForm => ({
  accountId: '', tradingBoxId: '', strategyId: '', startTime: dateTimeLocal(new Date()),
  symbol: '', marketOptionId: 'none', sessionTypeOptionId: 'auto', notes: '', tags: '',
  preTradePsychologyOptionIds: [],
});

/** مقدارهای پیش‌فرضِ سنجاق‌شده را فقط در فیلدهای هنوز خالی و فقط اگر هنوز معتبر باشند اعمال می‌کند. */
function applyDefaults(
  current: SessionForm,
  data: { accounts: Account[]; boxes: TradingBox[]; strategies: Strategy[] },
): SessionForm {
  const defaults = getJournalSessionDefaults();
  const next = { ...current };
  if (!next.accountId && defaults.accountId && data.accounts.some(item => item.id === defaults.accountId)) next.accountId = defaults.accountId;
  const account = data.accounts.find(item => item.id === next.accountId);
  const box = defaults.tradingBoxId ? data.boxes.find(item => item.id === defaults.tradingBoxId) : undefined;
  if (!next.tradingBoxId && box && account && isTradingBoxAvailableForAccount(box, account)) next.tradingBoxId = box.id;
  if (!next.strategyId && defaults.strategyId && data.strategies.some(item => item.id === defaults.strategyId)) next.strategyId = defaults.strategyId;
  if (!next.symbol && defaults.symbol) next.symbol = defaults.symbol;
  return next;
}

function DefaultPin({ pinned, disabled, onToggle, testId }: { pinned: boolean; disabled: boolean; onToggle: () => void; testId: string }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={pinned}
      aria-label={pinned ? 'برداشتن پیش‌فرض' : 'ذخیره به‌عنوان پیش‌فرض'}
      title={pinned ? 'پیش‌فرض است؛ برای برداشتن بزنید' : 'ذخیره به‌عنوان پیش‌فرض'}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${pinned ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
      data-testid={testId}>
      {pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}{pinned ? 'پیش‌فرض' : 'پیش‌فرض کن'}
    </button>
  );
}

export default function JournalSessions() {
  const [, setLocation] = useLocation();
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [boxes, setBoxes] = useState<TradingBox[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [form, setForm] = useState<SessionForm>(freshForm);
  const [defaults, setDefaults] = useState<Partial<JournalSessionDefaults>>(getJournalSessionDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await journalSessionService.ensureDefaultOptions();
      const [sessionRows, accountRows, boxRows, strategyRows, optionRows, hiddenCategoryIds] = await Promise.all([
        journalSessionService.getSessions(), accountService.getAll(), tradingBoxService.getAll(),
        strategyService.getAllStrategies(), journalSessionService.getOptions(), journalSessionService.getHiddenCategoryIds(),
      ]);
      setSessions(sessionRows);
      setAccounts(accountRows.filter(account => !account.isArchived));
      setBoxes(boxRows.filter(box => box.status === 'active'));
      setStrategies(strategyRows);
      setOptions(optionRows.filter(option => !hiddenCategoryIds.includes(option.category)));
      setDefaults(getJournalSessionDefaults());
      setForm(current => applyDefaults(current, {
        accounts: accountRows.filter(account => !account.isArchived),
        boxes: boxRows.filter(box => box.status === 'active'),
        strategies: strategyRows,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگذاری دفتر سشن‌ها انجام نشد.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const eligibleBoxes = useMemo(
    () => {
      const account = accounts.find(item => item.id === form.accountId);
      return boxes.filter(box => isTradingBoxAvailableForAccount(box, account));
    },
    [boxes, accounts, form.accountId],
  );
  const accountById = useMemo(() => new Map(accounts.map(item => [item.id, item])), [accounts]);
  const boxById = useMemo(() => new Map(boxes.map(item => [item.id, item])), [boxes]);
  const strategyById = useMemo(() => new Map(strategies.map(item => [item.id, item])), [strategies]);
  const sessionTypes = options.filter(item => item.category === 'session_type' && item.enabled);
  const marketOptions = options.filter(item => item.category === 'market' && item.enabled);
  const psychologyOptions = options.filter(item => item.category === 'psychology' && item.enabled);
  const startTimestamp = form.startTime ? new Date(form.startTime).getTime() : Number.NaN;
  const startMoment = describeSessionMoment(startTimestamp);
  const detectedKind = Number.isFinite(startTimestamp) ? detectSessionKind(startTimestamp) : null;
  const detectedSessionTypeId = detectedKind ? findSessionTypeOptionId(sessionTypes, detectedKind) : null;
  const togglePin = (key: JournalSessionDefaultKey) => {
    const value = form[key];
    const pinned = Boolean(value) && defaults[key] === (key === 'symbol' ? value.trim().toUpperCase() : value);
    try {
      setJournalSessionDefault(key, pinned ? null : value);
      setDefaults(getJournalSessionDefaults());
      toast.success(pinned ? 'پیش‌فرض برداشته شد.' : 'به‌عنوان پیش‌فرض ذخیره شد.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ پیش‌فرض انجام نشد.');
    }
  };
  const isPinned = (key: JournalSessionDefaultKey) => {
    const value = form[key];
    return Boolean(value) && defaults[key] === (key === 'symbol' ? value.trim().toUpperCase() : value);
  };
  const filteredSessions = sessions.filter(session => {
    const haystack = [
      ...parseJournalArray(session.symbols), accountById.get(session.accountId)?.name,
      boxById.get(session.tradingBoxId)?.name, strategyById.get(session.strategyId)?.name,
    ].join(' ').toLocaleLowerCase();
    return haystack.includes(query.toLocaleLowerCase().trim());
  });

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const symbols = form.symbol.trim() ? [form.symbol.trim().toUpperCase()] : [];
    if (!form.accountId || !form.tradingBoxId || !form.strategyId || !form.startTime || symbols.length !== 1 || form.marketOptionId === 'none') {
      toast.error('حساب، باکس، استراتژی، بازار، زمان شروع و یک نماد را مشخص کنید.');
      return;
    }
    setSaving(true);
    try {
      const session = await journalSessionService.createSession({
        accountId: form.accountId,
        tradingBoxId: form.tradingBoxId,
        strategyId: form.strategyId,
        startTime: new Date(form.startTime).getTime(),
        symbols,
        marketOptionId: form.marketOptionId,
        sessionTypeOptionId: form.sessionTypeOptionId === 'auto'
          ? detectedSessionTypeId
          : form.sessionTypeOptionId === 'none' ? null : form.sessionTypeOptionId,
        notes: form.notes,
        tags: form.tags.split(/[،,]+/).map(tag => tag.trim()).filter(Boolean),
        preTradePsychologyOptionIds: form.preTradePsychologyOptionIds,
      });
      toast.success('سشن ثبت شد.');
      setLocation(`/journal/sessions/${session.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ثبت سشن انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main dir="rtl" className="tradermind-page-shell mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8" data-testid="loading-journal-sessions">
    <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></div>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]"><Skeleton className="h-[30rem] rounded-2xl" /><Skeleton className="h-[30rem] rounded-2xl" /></div>
  </main>;

  return (
    <main dir="rtl" className="tradermind-page-shell mx-auto w-full max-w-6xl space-y-6 p-4 pb-12 md:p-8" data-testid="page-journal-sessions">
      <header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-primary">
            <span className="h-px w-7 bg-primary" /> دفتر ثبت معامله
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">سشن‌های معاملاتی</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">زمینه بازار، تصمیم‌ها و نتیجه را در یک سابقهٔ قابل اتکا کنار هم نگه دارید.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
          <Layers3 className="h-4 w-4 text-primary" /><span data-testid="text-session-count">{sessions.length} سشن ثبت‌شده</span>
        </div>
      </header>

      {error && <Card className="border-destructive/40 bg-destructive/5" data-testid="status-sessions-error"><CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
        <span className="flex items-center gap-2"><CircleAlert className="h-4 w-4 text-destructive" />{error}</span>
        <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-retry-sessions">تلاش دوباره</Button>
      </CardContent></Card>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)]">
        <Card className="tradermind-card overflow-hidden">
          <div className="border-b border-border/70 bg-primary/[0.035] px-5 py-4">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span>
              <div><h2 className="font-semibold">شروع سشن تازه</h2><p className="text-xs text-muted-foreground">اطلاعات زمینه پیش از ثبت اولین معامله</p></div>
            </div>
          </div>
          <CardContent className="p-5">
            {accounts.length === 0 || strategies.length === 0 || boxes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/25 p-5 text-sm leading-6 text-muted-foreground" data-testid="empty-session-prerequisites">
                برای شروع، دست‌کم یک حساب فعال، یک باکس فعال و یک استراتژی در برنامه لازم است.
                <div className="mt-2 text-xs">داده‌ها از فضای محلی همین دستگاه خوانده می‌شوند.</div>
              </div>
            ) : <form onSubmit={handleCreate} className="space-y-4" data-testid="form-create-session">
              <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="session-account">حساب فعال <span className="text-destructive">*</span></Label>
                <DefaultPin pinned={isPinned('accountId')} disabled={!form.accountId} onToggle={() => togglePin('accountId')} testId="pin-session-account" /></div>
                <Select value={form.accountId} onValueChange={value => setForm(current => {
                  const nextAccount = accounts.find(item => item.id === value);
                  const defaultBox = defaults.tradingBoxId ? boxes.find(item => item.id === defaults.tradingBoxId) : undefined;
                  const keepDefaultBox = defaultBox && nextAccount && isTradingBoxAvailableForAccount(defaultBox, nextAccount);
                  return { ...current, accountId: value, tradingBoxId: keepDefaultBox ? defaultBox.id : '' };
                })}>
                  <SelectTrigger id="session-account" data-testid="select-session-account"><SelectValue placeholder="انتخاب حساب" /></SelectTrigger>
                  <SelectContent>{accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name}{account.broker ? ` · ${account.broker}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="session-box">باکس معاملاتی فعال <span className="text-destructive">*</span></Label>
                <DefaultPin pinned={isPinned('tradingBoxId')} disabled={!form.tradingBoxId} onToggle={() => togglePin('tradingBoxId')} testId="pin-session-box" /></div>
                <Select value={form.tradingBoxId} onValueChange={value => setForm(current => ({ ...current, tradingBoxId: value }))} disabled={!form.accountId || eligibleBoxes.length === 0}>
                  <SelectTrigger id="session-box" data-testid="select-session-box"><SelectValue placeholder={form.accountId ? 'انتخاب باکس' : 'ابتدا حساب را انتخاب کنید'} /></SelectTrigger>
                  <SelectContent>{eligibleBoxes.map(box => <SelectItem key={box.id} value={box.id}>{box.name}</SelectItem>)}</SelectContent>
                </Select>
                {form.accountId && eligibleBoxes.length === 0 && <p className="text-xs text-muted-foreground">برای این حساب باکس فعال سازگار پیدا نشد.</p>}
              </div>
              <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="session-strategy">استراتژی <span className="text-destructive">*</span></Label>
                <DefaultPin pinned={isPinned('strategyId')} disabled={!form.strategyId} onToggle={() => togglePin('strategyId')} testId="pin-session-strategy" /></div>
                <Select value={form.strategyId} onValueChange={value => setForm(current => ({ ...current, strategyId: value }))}>
                  <SelectTrigger id="session-strategy" data-testid="select-session-strategy"><SelectValue placeholder="انتخاب استراتژی" /></SelectTrigger>
                  <SelectContent>{strategies.map(strategy => <SelectItem key={strategy.id} value={strategy.id}>{strategy.name}{!strategy.isActive ? ' · غیرفعال' : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="session-start">تاریخ و ساعت شروع <span className="text-destructive">*</span></Label><Input id="session-start" type="datetime-local" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} data-testid="input-session-start" /></div>
                <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="session-symbol">نماد <span className="text-destructive">*</span></Label>
                  <DefaultPin pinned={isPinned('symbol')} disabled={!form.symbol.trim()} onToggle={() => togglePin('symbol')} testId="pin-session-symbol" /></div>
                  <Input id="session-symbol" placeholder="EURUSD" value={form.symbol} onChange={event => setForm(current => ({ ...current, symbol: event.target.value }))} data-testid="input-session-symbol" /></div>
              </div>
              {startMoment && <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-sm leading-6" data-testid="text-session-start-preview">
                <span className="font-semibold">{startMoment.weekday}</span>
                <span className="mx-2 text-muted-foreground">·</span><span>{startMoment.jalali}</span>
                <span className="mx-2 text-muted-foreground">·</span><span dir="ltr">{startMoment.gregorian}</span>
                <span className="mx-2 text-muted-foreground">·</span><span>{startMoment.time}</span>
              </div>}
              <div className="space-y-2"><Label htmlFor="session-market">بازار <span className="text-destructive">*</span></Label>
                <Select value={form.marketOptionId} onValueChange={value => setForm(current => ({ ...current, marketOptionId: value }))}>
                  <SelectTrigger id="session-market" data-testid="select-session-market"><SelectValue placeholder="انتخاب بازار" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">انتخاب بازار</SelectItem>{marketOptions.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="session-kind">نوع سشن</Label>
                <Select value={form.sessionTypeOptionId} onValueChange={value => setForm(current => ({ ...current, sessionTypeOptionId: value }))}>
                  <SelectTrigger id="session-kind" data-testid="select-session-type"><SelectValue placeholder="تشخیص خودکار" /></SelectTrigger>
                  <SelectContent><SelectItem value="auto">تشخیص خودکار از ساعت شروع</SelectItem><SelectItem value="none">بدون دسته‌بندی</SelectItem>{sessionTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
                {form.sessionTypeOptionId === 'auto' && detectedKind && <p className="text-xs text-muted-foreground" data-testid="text-detected-session-type">
                  {detectedSessionTypeId
                    ? <>تشخیص خودکار: <span className="font-medium text-foreground">{sessionTypes.find(option => option.id === detectedSessionTypeId)?.label ?? sessionKindLabel(detectedKind)}</span></>
                    : `سشن ${sessionKindLabel(detectedKind)} تشخیص داده شد، اما گزینهٔ هم‌نامی در «نوع سشن» پیدا نشد؛ بدون دسته‌بندی ثبت می‌شود.`}
                </p>}
              </div>
              <div className="space-y-2"><Label htmlFor="session-notes">یادداشت زمینه</Label><Textarea id="session-notes" rows={3} placeholder="چه چیزی را در بازار دنبال می‌کنید؟" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} data-testid="input-session-notes" /></div>
              <div className="space-y-2"><Label>روان‌شناسی پیش از شروع</Label>
                {psychologyOptions.length ? <div className="flex flex-wrap gap-2" data-testid="list-pretrade-psychology">
                  {psychologyOptions.map(option => {
                    const selected = form.preTradePsychologyOptionIds.includes(option.id);
                    return <button key={option.id} type="button" aria-pressed={selected} onClick={() => setForm(current => ({
                      ...current,
                      preTradePsychologyOptionIds: selected
                        ? current.preTradePsychologyOptionIds.filter(id => id !== option.id)
                        : [...current.preTradePsychologyOptionIds, option.id],
                    }))} className={`rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`} data-testid={`toggle-pretrade-psychology-${option.id}`}>{option.label}</button>;
                  })}
                </div> : <p className="text-xs text-muted-foreground">گزینهٔ فعالی برای حالت روانی تعریف نشده است.</p>}
              </div>
              <div className="space-y-2"><Label htmlFor="session-tags">برچسب‌ها</Label><Input id="session-tags" placeholder="پلن A، خبر..." value={form.tags} onChange={event => setForm(current => ({ ...current, tags: event.target.value }))} data-testid="input-session-tags" /></div>
              <Button type="submit" className="w-full gap-2" disabled={saving || !form.accountId || !form.tradingBoxId || !form.strategyId || !form.symbol.trim() || form.marketOptionId === 'none' || eligibleBoxes.length === 0} data-testid="button-create-session">
                <Plus className="h-4 w-4" />{saving ? 'در حال ثبت…' : 'ثبت و باز کردن سشن'}
              </Button>
            </form>}
          </CardContent>
        </Card>

        <section className="space-y-4" aria-label="فهرست سشن‌ها">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-semibold">سوابق اخیر</h2><p className="text-xs text-muted-foreground">برای بازبینی جزئیات، یک سشن را انتخاب کنید.</p></div>
            <div className="relative w-full sm:max-w-[15rem]"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="جست‌وجوی سشن" placeholder="جست‌وجو در سوابق" value={query} onChange={event => setQuery(event.target.value)} className="pr-9" data-testid="input-search-sessions" /></div>
          </div>
          {sessions.length === 0 ? <Card className="border-dashed bg-card/50" data-testid="empty-session-list"><CardContent className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="h-6 w-6" /></div>
            <h3 className="font-semibold">هنوز سشنی ثبت نشده</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">با ثبت زمینهٔ بازار پیش از معامله، مرور نتیجه‌ها دقیق‌تر و منصفانه‌تر می‌شود.</p>
          </CardContent></Card> : filteredSessions.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="empty-session-search">موردی با این عبارت پیدا نشد.</div> : (
            <div className="space-y-3">
              {filteredSessions.map((session, index) => {
                const symbols = parseJournalArray(session.symbols);
                const status = session.status === 'active' ? 'در جریان' : session.status === 'completed' ? 'تکمیل‌شده' : 'لغوشده';
                return <button key={session.id} type="button" onClick={() => setLocation(`/journal/sessions/${session.id}`)} className="group w-full text-right" data-testid={`card-session-${session.id}`}>
                  <Card className="tradermind-card overflow-hidden transition-all group-hover:-translate-y-0.5">
                    <CardContent className="flex items-start justify-between gap-4 p-4 sm:p-5">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">#{String(filteredSessions.length - index).padStart(2, '0')}</span>
                          <Badge variant={session.status === 'active' ? 'default' : 'secondary'} data-testid={`status-session-${session.id}`}>{status}</Badge>
                          {symbols.map(symbol => <Badge key={symbol} variant="outline" className="font-mono text-[11px]" data-testid={`symbol-${session.id}-${symbol}`}>{symbol}</Badge>)}
                        </div>
                        <div className="text-sm font-semibold">{accountById.get(session.accountId)?.name ?? 'حساب در دسترس نیست'}<span className="mx-2 text-muted-foreground">/</span>{boxById.get(session.tradingBoxId)?.name ?? 'باکس حذف‌شده'}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" />{strategyById.get(session.strategyId)?.name ?? 'استراتژی حذف‌شده'}</span>
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDualDateTime(session.startTime)}</span>
                        </div>
                      </div>
                      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 text-muted-foreground transition group-hover:border-primary/40 group-hover:text-primary"><ArrowUpLeft className="h-4 w-4" /></span>
                    </CardContent>
                  </Card>
                </button>;
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}