import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  ArrowRight, CalendarClock, Check, CircleAlert, FilePlus2, Film, Image as ImageIcon,
  Paperclip, Pencil, Plus, Save, ShieldCheck, Target, Trash2, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountService } from '../services/accountService';
import { journalSessionService, parseJournalArray, triggerAnalysisIds, type JournalSessionBundle, type JournalSessionTimelineItem } from '../services/journalSessionService';
import { describeSessionMoment } from '../lib/sessionDateTime';
import { classifyScenarioOutcome, SCENARIO_OUTCOME_TONE, scenarioAccuracy } from '../lib/scenarioOutcome';
import { AnalysisFlexibleField } from '../components/journal/AnalysisFlexibleField';
import { JournalMediaStrip } from '../components/journal/JournalMediaStrip';
import { tradingBoxService } from '../services/tradingBoxService';
import { deleteScreenshotForMedia, saveJournalMediaScreenshot } from '../services/screenshotIntelligenceService';
import {
  DEFAULT_ANALYSIS_FIELD_LAYOUTS,
  getHiddenAnalysisFields,
  getJournalAnalysisFieldLabels,
  getJournalAnalysisFieldLayouts,
  JOURNAL_ANALYSIS_FIELD_LABELS,
  parseAnalysisFieldSelections,
  saveJournalAnalysisFieldLayouts,
  serializeAnalysisFieldSelections,
  type AnalysisFieldLayouts,
  type AnalysisFieldSelections,
  type AnalysisFlexibleFieldKey,
  type JournalAnalysisFieldLabels,
} from '../services/journalAnalysisFieldLabels';
import type { JournalMedia, JournalOption, JournalSessionAnalysis, Trade, TradingBox } from '../db/database';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/textarea';

type AnalysisDraft = {
  analysisText: string;
  marketContext: string;
  momentumText: string;
  pricePositionText: string;
  directionLogicText: string;
  fieldSelections: AnalysisFieldSelections;
  scenarioOutcomeOptionId: string;
  scenarioOutcomeNote: string;
  directionOptionId: string;
  marketStructureOptionId: string;
  liquidityContextOptionIds: string[];
  expectedDirectionOptionId: string;
  scenario: string;
  triggerContext: string;
  zones: string;
  notes: string;
  tags: string;
  previousTradeId: string;
  nextTradeId: string;
};
type TriggerDraft = {
  timeframeOptionId: string;
  analysisEventIds: string[];
  triggerTypeOptionId: string;
  description: string;
  marketMovement: string;
  directionOptionId: string;
  confirmed: boolean;
  notes: string;
};
const blankAnalysis = (): AnalysisDraft => ({
  analysisText: '', marketContext: '', momentumText: '', pricePositionText: '', directionLogicText: '', fieldSelections: {}, scenarioOutcomeOptionId: 'none', scenarioOutcomeNote: '',
  directionOptionId: 'none', marketStructureOptionId: 'none', liquidityContextOptionIds: [],
  expectedDirectionOptionId: 'none', scenario: '', triggerContext: '',
  zones: '', notes: '', tags: '', previousTradeId: 'none', nextTradeId: 'none',
});
const toDraft = (analysis?: JournalSessionAnalysis): AnalysisDraft => analysis ? ({
  analysisText: analysis.analysisText ?? '',
  marketContext: analysis.marketContext ?? '',
  momentumText: analysis.momentumText ?? '',
  pricePositionText: analysis.pricePositionText ?? '',
  directionLogicText: analysis.directionLogicText ?? '',
  fieldSelections: parseAnalysisFieldSelections(analysis.fieldSelections),
  scenarioOutcomeOptionId: analysis.scenarioOutcomeOptionId ?? 'none',
  scenarioOutcomeNote: analysis.scenarioOutcomeNote ?? '',
  directionOptionId: analysis.directionOptionId ?? 'none',
  marketStructureOptionId: analysis.marketStructureOptionId ?? 'none',
  liquidityContextOptionIds: parseJournalArray(analysis.liquidityContextOptionIds),
  expectedDirectionOptionId: analysis.expectedDirectionOptionId ?? 'none',
  scenario: analysis.scenario ?? '',
  triggerContext: analysis.triggerContext ?? '',
  zones: analysis.zones ?? '', notes: analysis.notes ?? '',
  tags: parseJournalArray(analysis.tags).join('، '),
  previousTradeId: analysis.previousTradeId ?? 'none',
  nextTradeId: analysis.nextTradeId ?? 'none',
}) : blankAnalysis();
const localDate = (timestamp: number) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
const money = (value: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value);
const statusName = (status: string) => status === 'active' ? 'در جریان' : status === 'completed' ? 'تکمیل‌شده' : 'لغوشده';
const safeOptions = (options: JournalOption[], category: string) => options.filter(option => option.enabled && option.category === category);

export default function JournalSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const [, setLocation] = useLocation();
  const [bundle, setBundle] = useState<JournalSessionBundle>();
  const [box, setBox] = useState<TradingBox>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessionDraft, setSessionDraft] = useState({
    notes: '', lessonsLearned: '', mistakesReview: '', psychologicalReview: '',
    strategyObservations: '', strategyChangeProposal: '', status: 'active' as 'active' | 'completed' | 'cancelled',
    sessionQuality: null as number | null, finalReflection: '',
  });
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, AnalysisDraft>>({});
  const [analysisFieldLabels, setAnalysisFieldLabels] = useState<JournalAnalysisFieldLabels>(
    JOURNAL_ANALYSIS_FIELD_LABELS,
  );
  const [selectedTimeframeIds, setSelectedTimeframeIds] = useState<string[]>([]);
  const [analysisCreating, setAnalysisCreating] = useState(false);
  const [fieldLayouts, setFieldLayouts] = useState<AnalysisFieldLayouts>(DEFAULT_ANALYSIS_FIELD_LAYOUTS);
  const [hiddenFields, setHiddenFields] = useState<ReadonlySet<string>>(() => new Set(getHiddenAnalysisFields()));
  const [triggerDraft, setTriggerDraft] = useState({
    timeframeOptionId: '', analysisEventIds: [] as string[], autoAnalysis: true, triggerTypeOptionId: 'none',
    description: '', marketMovement: '', directionOptionId: 'none', confirmed: true, notes: '',
  });
  const [triggerSaving, setTriggerSaving] = useState(false);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [triggerEditDraft, setTriggerEditDraft] = useState<TriggerDraft>({
    timeframeOptionId: '', analysisEventIds: [], triggerTypeOptionId: 'none',
    description: '', marketMovement: '', directionOptionId: 'none', confirmed: true, notes: '',
  });
  const [triggerEditSaving, setTriggerEditSaving] = useState(false);
  const [eventType, setEventType] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileCaption, setFileCaption] = useState('');
  const [attachmentAnalysisId, setAttachmentAnalysisId] = useState('session');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [busyMediaId, setBusyMediaId] = useState('');
  const [busyEventId, setBusyEventId] = useState('');
  const [accountName, setAccountName] = useState('');

  /**
   * silent=true: بارگذاری بی‌صدا؛ صفحه به حالت «در حال بارگذاری» نمی‌رود (اسکرول حفظ می‌شود)
   * و متن‌های ذخیره‌نشدهٔ کاربر در فرم‌ها پاک نمی‌شوند.
   */
  const reload = async (silent = false) => {
    if (!sessionId) { setLoading(false); setLoadError('شناسهٔ سشن معتبر نیست.'); return; }
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      setAnalysisFieldLabels(getJournalAnalysisFieldLabels());
      setHiddenFields(new Set(getHiddenAnalysisFields()));
      setFieldLayouts(getJournalAnalysisFieldLayouts());
      await journalSessionService.ensureDefaultOptions();
      const result = await journalSessionService.getBundle(sessionId);
      if (!result) { setBundle(undefined); setLoadError('این سشن پیدا نشد یا از دستگاه حذف شده است.'); return; }
      setBundle(result);
      const [account, currentBox] = await Promise.all([
        accountService.getAll().then(rows => rows.find(row => row.id === result.session.accountId)),
        tradingBoxService.getById(result.session.tradingBoxId),
      ]);
      setAccountName(account?.name ?? 'حساب در دسترس نیست');
      setBox(currentBox);
      if (!silent) {
        setSessionDraft({
          notes: result.session.notes ?? '', lessonsLearned: result.session.lessonsLearned ?? '',
          mistakesReview: result.session.mistakesReview ?? '', psychologicalReview: result.session.psychologicalReview ?? '',
          strategyObservations: result.session.strategyObservations ?? '', strategyChangeProposal: result.session.strategyChangeProposal ?? '',
          status: result.session.status,
          sessionQuality: result.session.sessionQuality ?? null,
          finalReflection: result.session.finalReflection ?? '',
        });
      }
      setAnalysisDrafts(current => Object.fromEntries(result.analyses.map(analysis => [
        analysis.id,
        silent && current[analysis.id] ? current[analysis.id] : toDraft(analysis),
      ])));
      const activeTimeframes = safeOptions(result.options, 'timeframe');
      const firstTimeframe = activeTimeframes.find(option => option.label.toLowerCase() === '1m') ?? activeTimeframes[0];
      setSelectedTimeframeIds(current => current.filter(id => activeTimeframes.some(option => option.id === id)));
      setTriggerDraft(current => ({
        ...current,
        timeframeOptionId: current.timeframeOptionId && activeTimeframes.some(option => option.id === current.timeframeOptionId)
          ? current.timeframeOptionId
          : firstTimeframe?.id ?? '',
        triggerTypeOptionId: current.triggerTypeOptionId !== 'none' && result.options.some(option => option.id === current.triggerTypeOptionId && option.enabled)
          ? current.triggerTypeOptionId
          : safeOptions(result.options, 'entry_trigger')[0]?.id ?? 'none',
      }));
      setEventType(current => silent && current ? current : safeOptions(result.options, 'session_event_type')[0]?.id ?? '');
      if (!silent) setAttachmentAnalysisId('session');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'خواندن اطلاعات سشن انجام نشد.');
    } finally { setLoading(false); }
  };
  const reloadSilent = () => reload(true);
  useEffect(() => { void reload(); }, [sessionId]);

  const bundleOptions = bundle?.options ?? [];
  const timeframes = safeOptions(bundleOptions, 'timeframe');
  const eventTypes = safeOptions(bundleOptions, 'session_event_type');
  const triggerTypes = safeOptions(bundleOptions, 'entry_trigger');
  const directions = safeOptions(bundleOptions, 'direction');
  const sessionType = bundleOptions.find(option => option.id === bundle?.session.sessionTypeOptionId)?.label;
  const marketName = bundleOptions.find(option => option.id === bundle?.session.marketOptionId)?.label;
  const metrics = useMemo(() => bundle ? journalSessionService.calculateMetrics(bundle.trades) : null, [bundle]);
  const media = bundle?.media ?? [];
  const analyses = bundle?.analyses ?? [];
  const triggers = bundle?.triggers ?? [];
  const timelineItems = useMemo<JournalSessionTimelineItem[]>(() => bundle ? [
    ...bundle.analyses.map(record => ({ id: record.id, kind: 'analysis' as const, timestamp: record.createdAt, record })),
    ...bundle.triggers.map(record => ({ id: record.id, kind: 'trigger' as const, timestamp: record.createdAt, record })),
    ...bundle.trades.map(record => ({ id: record.id, kind: 'trade' as const, timestamp: record.closedAt ?? record.openedAt, record })),
    ...bundle.events.map(record => ({ id: record.id, kind: 'event' as const, timestamp: record.eventAt, record })),
  ].sort((a, b) => a.timestamp - b.timestamp) : [], [bundle]);

  const updateAnalysisDraft = (analysisId: string, patch: Partial<AnalysisDraft>) => {
    setAnalysisDrafts(current => ({ ...current, [analysisId]: { ...(current[analysisId] ?? blankAnalysis()), ...patch } }));
  };
  const changeFieldRows = (key: AnalysisFlexibleFieldKey, rows: number) => {
    const next = { ...fieldLayouts, [key]: { ...fieldLayouts[key], rows } };
    setFieldLayouts(next);
    try { saveJournalAnalysisFieldLayouts(next); void journalSessionService.saveAnalysisFieldConfig(); } catch { /* اندازه فقط برای همین نمایش اعمال می‌شود */ }
  };
  const createAnalysisEvents = async () => {
    if (!bundle || selectedTimeframeIds.length === 0) return;
    setAnalysisCreating(true);
    try {
      for (const timeframeOptionId of selectedTimeframeIds) {
        await journalSessionService.createAnalysisEvent({
          sessionId,
          timeframeOptionId,
          analysisText: '',
          marketContext: '',
          momentumText: '',
          pricePositionText: '',
          directionLogicText: '',
          fieldSelections: '{}',
          scenarioOutcomeOptionId: null,
          scenarioOutcomeNote: '',
          directionOptionId: null,
          marketStructureOptionId: null,
          liquidityContextOptionIds: '[]',
          expectedDirectionOptionId: null,
          scenario: '',
          triggerContext: '',
          zones: '',
          notes: '',
          tags: '[]',
          previousTradeId: null,
          nextTradeId: null,
        });
      }
      setSelectedTimeframeIds([]);
      toast.success('رویداد تحلیل برای تایم‌فریم‌های انتخاب‌شده ساخته شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ساخت رویداد تحلیل انجام نشد.'); }
    finally { setAnalysisCreating(false); }
  };
  const saveAnalysis = async (analysisId: string) => {
    if (!bundle) return;
    const existing = analyses.find(item => item.id === analysisId);
    if (!existing) return;
    const draft = analysisDrafts[analysisId] ?? toDraft(existing);
    setSaving(true);
    try {
      await journalSessionService.updateAnalysisEvent(analysisId, {
        sessionId, timeframeOptionId: existing.timeframeOptionId,
        analysisText: draft.analysisText,
        marketContext: draft.marketContext,
        momentumText: draft.momentumText,
        pricePositionText: draft.pricePositionText,
        directionLogicText: draft.directionLogicText,
        fieldSelections: serializeAnalysisFieldSelections(draft.fieldSelections),
        scenarioOutcomeOptionId: draft.scenarioOutcomeOptionId === 'none' ? null : draft.scenarioOutcomeOptionId,
        scenarioOutcomeNote: draft.scenarioOutcomeNote,
        directionOptionId: draft.directionOptionId === 'none' ? null : draft.directionOptionId,
        marketStructureOptionId: draft.marketStructureOptionId === 'none' ? null : draft.marketStructureOptionId,
        liquidityContextOptionIds: JSON.stringify(draft.liquidityContextOptionIds),
        expectedDirectionOptionId: draft.expectedDirectionOptionId === 'none' ? null : draft.expectedDirectionOptionId,
        scenario: draft.scenario,
        triggerContext: draft.triggerContext,
        zones: draft.zones, notes: draft.notes,
        tags: JSON.stringify(draft.tags.split(/[،,]+/).map(value => value.trim()).filter(Boolean)),
        previousTradeId: draft.previousTradeId === 'none' ? null : draft.previousTradeId,
        nextTradeId: draft.nextTradeId === 'none' ? null : draft.nextTradeId,
      });
      toast.success('رویداد تحلیل ذخیره شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ تحلیل انجام نشد.'); }
    finally { setSaving(false); }
  };
  const deleteAnalysis = async (analysisId: string) => {
    if (!window.confirm('این رویداد تحلیل حذف شود؟ پیوست‌های آن در سشن باقی می‌مانند.')) return;
    try {
      await journalSessionService.deleteAnalysisEvent(analysisId);
      await reloadSilent();
      toast.success('رویداد تحلیل حذف شد.');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف رویداد تحلیل انجام نشد.'); }
  };
  const createTrigger = async (continueToTrade: boolean) => {
    if (!bundle || !triggerDraft.timeframeOptionId) { toast.error('تایم‌فریم تریگر را انتخاب کنید.'); return; }
    if (continueToTrade && !triggerDraft.confirmed) { toast.error('برای ادامه به ثبت معامله، تریگر را تأیید کنید.'); return; }
    setTriggerSaving(true);
    try {
      // در حالت خودکار، همهٔ تحلیل‌های همین سشن به این تریگر وصل می‌شوند.
      const linkedAnalysisIds = triggerDraft.autoAnalysis ? analyses.map(item => item.id) : triggerDraft.analysisEventIds;
      const trigger = await journalSessionService.createTriggerEvent({
        sessionId,
        timeframeOptionId: triggerDraft.timeframeOptionId,
        analysisEventId: linkedAnalysisIds[0] ?? null,
        analysisEventIds: linkedAnalysisIds,
        triggerTypeOptionId: triggerDraft.triggerTypeOptionId === 'none' ? null : triggerDraft.triggerTypeOptionId,
        description: triggerDraft.description,
        marketMovement: triggerDraft.marketMovement,
        directionOptionId: triggerDraft.directionOptionId === 'none' ? null : triggerDraft.directionOptionId,
        confirmed: triggerDraft.confirmed,
        notes: triggerDraft.notes,
      });
      if (continueToTrade) {
        setLocation(`/journal/trades/new?journalSessionId=${encodeURIComponent(sessionId)}&journalTriggerId=${encodeURIComponent(trigger.id)}&returnTo=${encodeURIComponent(`/journal/sessions/${sessionId}`)}`);
        return;
      }
      setTriggerDraft(current => ({ ...current, description: '', marketMovement: '', notes: '' }));
      toast.success('تریگر به‌عنوان رویداد مستقل ذخیره شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ثبت تریگر انجام نشد.'); }
    finally { setTriggerSaving(false); }
  };
  const updateTriggerStatus = async (triggerId: string, status: 'pending' | 'ignored' | 'invalid') => {
    try { await journalSessionService.updateTriggerEvent(triggerId, { status }); await reloadSilent(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'به‌روزرسانی وضعیت تریگر انجام نشد.'); }
  };
  const beginTriggerEdit = (triggerId: string) => {
    const trigger = triggers.find(item => item.id === triggerId);
    if (!trigger) return;
    setTriggerEditDraft({
      timeframeOptionId: trigger.timeframeOptionId,
      analysisEventIds: triggerAnalysisIds(trigger),
      triggerTypeOptionId: trigger.triggerTypeOptionId ?? 'none',
      description: trigger.description,
      marketMovement: trigger.marketMovement,
      directionOptionId: trigger.directionOptionId ?? 'none',
      confirmed: trigger.confirmed,
      notes: trigger.notes,
    });
    setEditingTriggerId(trigger.id);
  };
  const saveTriggerEdit = async (triggerId: string) => {
    setTriggerEditSaving(true);
    try {
      await journalSessionService.updateTriggerEvent(triggerId, {
        timeframeOptionId: triggerEditDraft.timeframeOptionId,
        analysisEventIds: triggerEditDraft.analysisEventIds,
        triggerTypeOptionId: triggerEditDraft.triggerTypeOptionId === 'none' ? null : triggerEditDraft.triggerTypeOptionId,
        directionOptionId: triggerEditDraft.directionOptionId === 'none' ? null : triggerEditDraft.directionOptionId,
        description: triggerEditDraft.description,
        marketMovement: triggerEditDraft.marketMovement,
        confirmed: triggerEditDraft.confirmed,
        notes: triggerEditDraft.notes,
      });
      setEditingTriggerId(null);
      toast.success('تغییرات تریگر ذخیره شد.');
      await reloadSilent();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ تغییرات تریگر انجام نشد.');
    } finally {
      setTriggerEditSaving(false);
    }
  };
  const saveSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bundle) return;
    setSaving(true);
    try {
      await journalSessionService.updateSession(sessionId, {
        ...sessionDraft,
        endTime: sessionDraft.status === 'active' ? null : (bundle.session.endTime ?? Date.now()),
      });
      toast.success('یادداشت و وضعیت سشن ذخیره شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ سشن انجام نشد.'); }
    finally { setSaving(false); }
  };
  const addEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventType) { toast.error('نوع رویداد فعال در دسترس نیست.'); return; }
    setEventSaving(true);
    try {
      await journalSessionService.addEvent({
        sessionId, typeOptionId: eventType, notes: eventNotes,
        eventAt: eventTime ? new Date(eventTime).getTime() : Date.now(),
      });
      setEventNotes(''); setEventTime('');
      toast.success('رویداد ثبت شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ثبت رویداد انجام نشد.'); }
    finally { setEventSaving(false); }
  };
  const removeEvent = async (eventId: string) => {
    setBusyEventId(eventId);
    try { await journalSessionService.deleteEvent(eventId); await reloadSilent(); toast.success('رویداد حذف شد.'); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف رویداد انجام نشد.'); }
    finally { setBusyEventId(''); }
  };
  const addMedia = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { toast.error('ابتدا یک فایل انتخاب کنید.'); return; }
    setMediaSaving(true);
    try {
      const [targetType, targetId] = attachmentAnalysisId === 'session' ? ['session', ''] : attachmentAnalysisId.split(':', 2);
      const savedMedia = await journalSessionService.saveMedia({
        sessionId,
        analysisId: targetType === 'analysis' ? targetId : undefined,
        triggerId: targetType === 'trigger' ? targetId : undefined,
        category: targetType === 'analysis' ? 'analysis' : targetType === 'trigger' ? 'trigger' : 'session',
        file, caption: fileCaption,
      });
      if (file.type.startsWith('image/')) {
        try {
          await saveJournalMediaScreenshot(savedMedia, bundle?.session);
        } catch {
          toast.warning('پیوست سشن ذخیره شد، اما افزودن آن به کتابخانهٔ اسکرین‌شات انجام نشد.');
        }
      }
      setFile(null); setFileCaption('');
      const input = document.getElementById('session-media-file') as HTMLInputElement | null;
      if (input) input.value = '';
      toast.success('پیوست در حافظهٔ محلی ذخیره شد.');
      await reloadSilent();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ فایل انجام نشد.'); }
    finally { setMediaSaving(false); }
  };
  const removeMedia = async (mediaId: string) => {
    setBusyMediaId(mediaId);
    try {
      await journalSessionService.deleteMedia(mediaId);
      await deleteScreenshotForMedia(mediaId);
      await reloadSilent();
      toast.success('پیوست حذف شد.');
    }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف پیوست انجام نشد.'); }
    finally { setBusyMediaId(''); }
  };
  const openMedia = (item: JournalMedia) => {
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.fileName; anchor.target = '_blank'; anchor.rel = 'noreferrer';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  if (loading) return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8" data-testid="loading-session-detail">
    <Skeleton className="h-9 w-56" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" />
  </main>;

  if (!bundle) return <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-5 p-4 pt-10 md:p-8" data-testid="status-session-not-found">
    <Button variant="ghost" onClick={() => setLocation('/journal/sessions')} className="gap-2" data-testid="button-back-sessions"><ArrowRight className="h-4 w-4" />همهٔ سشن‌ها</Button>
    <Card className="border-destructive/30"><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
      <CircleAlert className="h-8 w-8 text-destructive" /><h1 className="font-semibold">دسترسی به سشن ممکن نیست</h1><p className="text-sm text-muted-foreground">{loadError || 'اطلاعاتی برای نمایش وجود ندارد.'}</p>
      <Button variant="outline" onClick={() => void reload()} data-testid="button-retry-session-detail">تلاش دوباره</Button>
    </CardContent></Card>
  </main>;

  const metricItems = [
    { label: 'معامله', value: metrics?.totalTrades ?? 0 },
    { label: 'برد', value: metrics?.wins ?? 0, tone: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'باخت', value: metrics?.losses ?? 0, tone: 'text-rose-700 dark:text-rose-300' },
    { label: 'نرخ برد', value: metrics?.winRate == null ? '—' : `${money(metrics.winRate)}٪` },
    { label: 'سود ناخالص', value: metrics ? money(metrics.totalProfit) : '—', tone: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'زیان ناخالص', value: metrics ? money(metrics.totalLoss) : '—', tone: 'text-rose-700 dark:text-rose-300' },
    { label: 'خالص سود/زیان', value: metrics ? money(metrics.netPnl) : '—', tone: (metrics?.netPnl ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300' },
    { label: 'مجموع R', value: metrics ? `${money(metrics.totalR)}R` : '—' },
    { label: 'میانگین R', value: metrics?.averageR == null ? '—' : `${money(metrics.averageR)}R` },
  ];
  const directionName = (trade: Trade) => trade.direction === 'long' ? 'خرید' : 'فروش';
  const scrollToTrigger = () => document.getElementById('journal-trigger-capture')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const optionLabel = (optionId: string | null | undefined, fallback: string) =>
    bundleOptions.find(option => option.id === optionId)?.label ?? fallback;

  return <main dir="rtl" className="tradermind-page-shell mx-auto w-full max-w-6xl space-y-5 p-4 pb-14 md:p-8" data-testid="page-journal-session-detail">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" className="gap-2 px-2 text-muted-foreground" onClick={() => setLocation('/journal/sessions')} data-testid="button-back-sessions"><ArrowRight className="h-4 w-4" />بازگشت به سشن‌ها</Button>
      <Button className="gap-2" onClick={scrollToTrigger} data-testid="button-start-session-trade"><Plus className="h-4 w-4" />ثبت معامله در این سشن</Button>
    </div>

    <Card className="tradermind-card overflow-hidden" data-testid="card-session-overview">
      <div className="h-1 bg-gradient-to-l from-primary via-primary/45 to-transparent" />
      <CardContent className="p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={bundle.session.status === 'active' ? 'default' : 'secondary'} data-testid="status-session-detail">{statusName(bundle.session.status)}</Badge>
              {sessionType && <Badge variant="outline" data-testid="text-session-type">{sessionType}</Badge>}
              {marketName && <Badge variant="outline" data-testid="text-session-market">{marketName}</Badge>}
              {parseJournalArray(bundle.session.tags).map((tag, index) => <Badge key={`${tag}-${index}`} variant="outline" className="text-muted-foreground">{tag}</Badge>)}
            </div>
            <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{parseJournalArray(bundle.session.symbols).join(' / ') || 'سشن بدون نماد'}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span data-testid="text-session-account">{accountName}</span><span>·</span><span data-testid="text-session-box">{box?.name ?? 'باکس در دسترس نیست'}</span><span>·</span><span data-testid="text-session-strategy">{bundle.strategyVersion?.strategyName ?? bundle.strategy?.name ?? 'استراتژی در دسترس نیست'}</span>
                {bundle.strategyVersion && <span className="font-mono text-[11px]">نسخه {bundle.strategyVersion.versionNumber}</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            {(() => {
              const moment = describeSessionMoment(bundle.session.startTime);
              return moment ? <div className="space-y-0.5 leading-6" data-testid="text-session-start-time">
                <div className="font-semibold">{moment.weekday} · {moment.time}</div>
                <div className="text-xs text-muted-foreground">شمسی: {moment.jalali}</div>
                <div className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'right' }}>Gregorian: {moment.gregorian}</div>
              </div> : <span data-testid="text-session-start-time">{localDate(bundle.session.startTime)}</span>;
            })()}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {metricItems.map(item => <div key={item.label} className="rounded-lg border border-border/70 bg-background/60 px-3 py-3" data-testid={`metric-session-${item.label}`}>
            <div className="text-[11px] text-muted-foreground">{item.label}</div><div className={`mt-1 font-mono text-lg font-semibold ${item.tone ?? ''}`}>{item.value}</div>
          </div>)}
        </div>
        {(() => {
          const counts = { hit: 0, partial: 0, invalidated: 0, notTriggered: 0 };
          for (const item of analyses) {
            const kind = classifyScenarioOutcome(item.scenarioOutcomeOptionId ? optionLabel(item.scenarioOutcomeOptionId, '') : '');
            if (kind === 'hit') counts.hit += 1;
            else if (kind === 'partial') counts.partial += 1;
            else if (kind === 'invalidated') counts.invalidated += 1;
            else if (kind === 'not_triggered') counts.notTriggered += 1;
          }
          const accuracy = scenarioAccuracy(counts);
          return accuracy == null ? null : <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="section-scenario-accuracy">
            <span className="font-medium text-muted-foreground">دقت سناریوها در این سشن:</span>
            <Badge variant="secondary">{money(accuracy)}٪</Badge>
            <span className="text-muted-foreground">{counts.hit} مطابق · {counts.partial} تا حدی · {counts.invalidated} باطل · {counts.notTriggered} فعال‌نشده</span>
          </div>;
        })()}
        <div className="mt-4 space-y-2" data-testid="section-pretrade-psychology">
          <p className="text-xs font-medium text-muted-foreground">حالت روانی پیش از شروع</p>
          <div className="flex flex-wrap gap-1.5">
            {parseJournalArray(bundle.session.preTradePsychology).length === 0
              ? <span className="text-xs text-muted-foreground">ثبت نشده</span>
              : parseJournalArray(bundle.session.preTradePsychology).map(id => <Badge key={id} variant="secondary">{optionLabel(id, 'گزینهٔ حذف‌شده')}</Badge>)}
          </div>
        </div>
      </CardContent>
    </Card>

    <section className="space-y-3" aria-labelledby="session-timeline-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">SESSION HISTORY</p><h2 id="session-timeline-heading" className="mt-1 text-xl font-semibold">خط زمانی سشن</h2></div><span className="text-xs text-muted-foreground">{timelineItems.length} رویداد</span></div>
      {timelineItems.length === 0 ? <Card className="border-dashed"><CardContent className="p-5 text-sm text-muted-foreground" data-testid="empty-session-timeline">هنوز رویدادی برای نمایش وجود ندارد.</CardContent></Card> : <Card className="tradermind-card overflow-hidden">
        <div className="divide-y divide-border/70">
          {timelineItems.map(item => {
            const kindLabel = item.kind === 'analysis' ? 'تحلیل'
              : item.kind === 'trigger' ? 'تریگر'
                : item.kind === 'trade' ? 'معامله' : 'بدون معامله';
            const summary = item.kind === 'analysis'
              ? optionLabel(item.record.timeframeOptionId, 'تایم‌فریم حذف‌شده')
              : item.kind === 'trigger'
                ? `${optionLabel(item.record.timeframeOptionId, 'تایم‌فریم حذف‌شده')} · ${item.record.description || optionLabel(item.record.triggerTypeOptionId, 'تریگر')}`
                : item.kind === 'trade'
                  ? `${item.record.symbol} · ${item.record.status === 'open' ? 'باز' : item.record.result}`
                  : optionLabel(item.record.typeOptionId, 'رویداد');
            const details = item.kind === 'analysis' ? item.record.analysisText || item.record.marketContext || item.record.scenario || item.record.notes
              : item.kind === 'trigger' ? item.record.marketMovement || item.record.notes
                : item.kind === 'event' ? item.record.notes : '';
            return <div key={`${item.kind}-${item.id}`} className="flex items-start gap-3 px-4 py-3" data-testid={`timeline-item-${item.kind}-${item.id}`}>
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-[10px]">{kindLabel}</Badge>
                  {item.kind === 'trade' ? <Link href={`/journal/trades/${item.record.id}`} className="text-sm font-medium text-primary hover:underline" data-testid={`timeline-trade-link-${item.id}`}>{summary}</Link> : <span className="text-sm font-medium">{summary}</span>}
                  <span className="text-[10px] text-muted-foreground">{localDate(item.timestamp)}</span>
                </div>
                {details && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{details}</p>}
              </div>
            </div>;
          })}
        </div>
      </Card>}
    </section>

    <section className="space-y-3" aria-labelledby="analysis-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">MARKET CONTEXT</p><h2 id="analysis-heading" className="mt-1 text-xl font-semibold">رویدادهای تحلیل چندبازه‌ای</h2></div><span className="text-xs text-muted-foreground">{analyses.length} رویداد تحلیل</span></div>
      {timeframes.length === 0 ? <Card className="border-dashed"><CardContent className="p-5 text-sm text-muted-foreground" data-testid="empty-enabled-timeframes">تایم‌فریم فعالی برای تحلیل وجود ندارد. گزینه‌های غیرفعال عمداً قابل انتخاب نیستند.</CardContent></Card> : (
        <Card className="tradermind-card">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">یک یا چند تایم‌فریم فعال را انتخاب کنید؛ هر بار ثبت، رویداد تازه می‌سازد و تحلیل قبلی را بازنویسی نمی‌کند.</p>
            <div className="flex flex-wrap gap-2" data-testid="list-analysis-timeframes">
              {timeframes.map(option => {
                const selected = selectedTimeframeIds.includes(option.id);
                return <button key={option.id} type="button" aria-pressed={selected}
                  onClick={() => setSelectedTimeframeIds(current => selected ? current.filter(id => id !== option.id) : [...current, option.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  data-testid={`toggle-analysis-timeframe-${option.id}`}>{option.label}</button>;
              })}
            </div>
            <Button type="button" onClick={() => void createAnalysisEvents()} disabled={analysisCreating || selectedTimeframeIds.length === 0} className="gap-2" data-testid="button-create-analysis-events">
              <Plus className="h-4 w-4" />{analysisCreating ? 'در حال ساخت…' : 'افزودن رویداد تحلیل'}
            </Button>
          </CardContent>
        </Card>
      )}
      {analyses.length === 0 ? <Card className="border-dashed"><CardContent className="p-5 text-center text-sm text-muted-foreground" data-testid="empty-analysis-events">هنوز رویدادی ثبت نشده است.</CardContent></Card> : (
        <div className="grid gap-4">
          {analyses.map((analysis, index) => {
            const draft = analysisDrafts[analysis.id] ?? toDraft(analysis);
            const selectField = (label: string, category: string, value: string, setValue: (next: string) => void, testId: string) => {
              const options = safeOptions(bundleOptions, category);
              return <div className="space-y-1.5"><Label className="text-xs">{label}</Label><Select value={value} onValueChange={setValue}>
                <SelectTrigger data-testid={testId}><SelectValue placeholder="ثبت نشده" /></SelectTrigger>
                <SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
              </Select></div>;
            };
            const renderFlexible = (key: AnalysisFlexibleFieldKey) => {
              if (hiddenFields.has(key)) return null;
              const layout = fieldLayouts[key];
              return <AnalysisFlexibleField
                key={key}
                label={analysisFieldLabels[key]}
                layout={layout}
                textValue={draft[key]}
                selectedIds={draft.fieldSelections[key] ?? []}
                options={safeOptions(bundleOptions, layout.optionCategory)}
                onTextChange={value => updateAnalysisDraft(analysis.id, { [key]: value })}
                onSelectedChange={ids => updateAnalysisDraft(analysis.id, { fieldSelections: { ...draft.fieldSelections, [key]: ids } })}
                onRowsChange={rows => changeFieldRows(key, rows)}
                testId={`${key}-${analysis.id}`}
              />;
            };
            return <Card key={analysis.id} className="tradermind-card overflow-hidden" data-testid={`card-analysis-${analysis.id}`}>
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2"><span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, '0')}</span><h3 className="font-semibold">{optionLabel(analysis.timeframeOptionId, 'تایم‌فریم حذف‌شده')}</h3><Badge variant="outline" className="text-[10px]">رویداد مستقل</Badge>
                  {analysis.scenarioOutcomeOptionId && <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SCENARIO_OUTCOME_TONE[classifyScenarioOutcome(optionLabel(analysis.scenarioOutcomeOptionId, ''))]}`} data-testid={`badge-scenario-outcome-${analysis.id}`}>{optionLabel(analysis.scenarioOutcomeOptionId, 'نتیجه')}</span>}</div>
                <span className="text-[10px] text-muted-foreground">{localDate(analysis.createdAt)}</span>
              </div>
              <CardContent className="space-y-4 p-4">
                {renderFlexible('analysisText')}
                {renderFlexible('marketContext')}
                {renderFlexible('momentumText')}
                {renderFlexible('pricePositionText')}
                {!hiddenFields.has('expectedDirectionOptionId') && selectField(analysisFieldLabels.expectedDirectionOptionId, 'direction', draft.expectedDirectionOptionId, value => updateAnalysisDraft(analysis.id, { expectedDirectionOptionId: value }), `select-expected-direction-${analysis.id}`)}
                {renderFlexible('directionLogicText')}
                {renderFlexible('scenario')}
                {renderFlexible('triggerContext')}
                {renderFlexible('zones')}
                {!hiddenFields.has('notes') && <div className="space-y-1.5"><Label className="text-xs">{analysisFieldLabels.notes}</Label><Textarea rows={3} className="resize-y" value={draft.notes} onChange={event => updateAnalysisDraft(analysis.id, { notes: event.target.value })} data-testid={`input-analysis-notes-${analysis.id}`} /></div>}
                <div className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3" data-testid={`panel-scenario-outcome-${analysis.id}`}>
                  <p className="text-xs font-medium text-muted-foreground">نتیجهٔ سناریو (بعد از پایان سشن ثبت کنید)</p>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
                    <Select value={draft.scenarioOutcomeOptionId} onValueChange={value => updateAnalysisDraft(analysis.id, { scenarioOutcomeOptionId: value })}>
                      <SelectTrigger data-testid={`select-scenario-outcome-${analysis.id}`}><SelectValue placeholder="ثبت نشده" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{safeOptions(bundleOptions, 'scenario_outcome').map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Textarea rows={2} className="resize-y" placeholder="چرا سناریو همین‌طور پیش رفت؟ (اختیاری)" value={draft.scenarioOutcomeNote} onChange={event => updateAnalysisDraft(analysis.id, { scenarioOutcomeNote: event.target.value })} data-testid={`input-scenario-outcome-note-${analysis.id}`} />
                  </div>
                </div>
                <JournalMediaStrip session={bundle.session} analysisId={analysis.id} media={media} onChanged={reloadSilent} testIdPrefix={`analysis-${analysis.id}`} />
                {(draft.directionOptionId !== 'none' || draft.marketStructureOptionId !== 'none' || draft.liquidityContextOptionIds.length > 0) && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs leading-6 text-muted-foreground" data-testid={`legacy-analysis-values-${analysis.id}`}>
                    <span className="font-medium">مقادیر ثبت‌شدهٔ قبلی: </span>
                    {draft.directionOptionId !== 'none' && <span>{analysisFieldLabels.directionOptionId}: {optionLabel(draft.directionOptionId, '—')} · </span>}
                    {draft.marketStructureOptionId !== 'none' && <span>{analysisFieldLabels.marketStructureOptionId}: {optionLabel(draft.marketStructureOptionId, '—')} · </span>}
                    {draft.liquidityContextOptionIds.length > 0 && <span>{analysisFieldLabels.liquidityContextOptionIds}: {draft.liquidityContextOptionIds.map(id => optionLabel(id, '—')).join('، ')}</span>}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['previousTradeId', 'nextTradeId'] as const).filter(field => !hiddenFields.has(field)).map(field => <div key={field} className="space-y-1.5">
                     <Label className="text-xs">{analysisFieldLabels[field]}</Label>
                    <Select value={draft[field]} onValueChange={value => updateAnalysisDraft(analysis.id, { [field]: value })}>
                      <SelectTrigger data-testid={`select-${field}-${analysis.id}`}><SelectValue placeholder="بدون پیوند" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">بدون پیوند</SelectItem>{bundle.trades.map(trade => <SelectItem key={trade.id} value={trade.id}>{trade.symbol} · {localDate(trade.openedAt)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>)}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  {hiddenFields.has('tags') ? <div className="flex-1" /> : <div className="flex-1 space-y-1.5"><Label className="text-xs">{analysisFieldLabels.tags}</Label><Input placeholder="ساختار تمیز، نیازمند تأیید" value={draft.tags} onChange={event => updateAnalysisDraft(analysis.id, { tags: event.target.value })} data-testid={`input-analysis-tags-${analysis.id}`} /></div>}
                  <Button type="button" onClick={() => void saveAnalysis(analysis.id)} disabled={saving} className="gap-2" data-testid={`button-save-analysis-${analysis.id}`}><Save className="h-4 w-4" />ذخیره رویداد</Button>
                  <Button type="button" variant="ghost" onClick={() => void deleteAnalysis(analysis.id)} className="gap-2 text-destructive" data-testid={`button-delete-analysis-${analysis.id}`}><Trash2 className="h-4 w-4" />حذف</Button>
                </div>
              </CardContent>
            </Card>;
          })}
        </div>
      )}
    </section>

    <section id="journal-trigger-capture" className="space-y-3" aria-labelledby="trigger-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">EXECUTION TRIGGER</p><h2 id="trigger-heading" className="mt-1 text-xl font-semibold">تریگر و ثبت معامله</h2></div><Badge variant="outline" data-testid="text-trigger-count">{triggers.length} تریگر · {triggers.filter(item => item.status === 'ignored').length} نادیده · {triggers.filter(item => item.status === 'invalid').length} نامعتبر</Badge></div>
      <Card className="tradermind-card" data-testid="card-trigger-capture">
        <CardContent className="space-y-4 p-4">
          <p className="text-sm leading-6 text-muted-foreground">تریگر 1M را پیش از ورود ثبت کنید. در صورت تأیید، ادامه به فرم اجرا، ارتباط تریگر و تحلیل انتخابی را با معامله حفظ می‌کند.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">تایم‌فریم تریگر</Label><Select value={triggerDraft.timeframeOptionId} onValueChange={value => setTriggerDraft(current => ({ ...current, timeframeOptionId: value }))}>
              <SelectTrigger data-testid="select-trigger-timeframe"><SelectValue placeholder="انتخاب تایم‌فریم" /></SelectTrigger><SelectContent>{timeframes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-2 sm:col-span-2" data-testid="field-trigger-analysis">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">تحلیل‌های مرتبط با این تریگر</Label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={triggerDraft.autoAnalysis} onChange={event => setTriggerDraft(current => ({ ...current, autoAnalysis: event.target.checked }))} data-testid="checkbox-trigger-auto-analysis" />
                  تشخیص خودکار (همهٔ تحلیل‌های این سشن)
                </label>
              </div>
              {analyses.length === 0
                ? <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-testid="empty-trigger-analysis">هنوز تحلیلی ثبت نشده است.</p>
                : triggerDraft.autoAnalysis
                  ? <div className="flex flex-wrap gap-1.5" data-testid="list-trigger-auto-analysis">{analyses.map(analysis => <Badge key={analysis.id} variant="secondary">{optionLabel(analysis.timeframeOptionId, 'تحلیل')}</Badge>)}</div>
                  : <div className="flex flex-wrap gap-2" data-testid="list-trigger-analysis">{analyses.map(analysis => {
                    const selected = triggerDraft.analysisEventIds.includes(analysis.id);
                    return <button key={analysis.id} type="button" aria-pressed={selected}
                      onClick={() => setTriggerDraft(current => ({ ...current, analysisEventIds: selected ? current.analysisEventIds.filter(id => id !== analysis.id) : [...current.analysisEventIds, analysis.id] }))}
                      className={`rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      data-testid={`toggle-trigger-analysis-${analysis.id}`}>{optionLabel(analysis.timeframeOptionId, 'تحلیل')}</button>;
                  })}</div>}
            </div>
            <div className="space-y-1.5"><Label className="text-xs">نوع تریگر</Label><Select value={triggerDraft.triggerTypeOptionId} onValueChange={value => setTriggerDraft(current => ({ ...current, triggerTypeOptionId: value }))}>
              <SelectTrigger data-testid="select-trigger-type"><SelectValue placeholder="انتخاب نوع" /></SelectTrigger><SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{triggerTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-1.5"><Label className="text-xs">جهت</Label><Select value={triggerDraft.directionOptionId} onValueChange={value => setTriggerDraft(current => ({ ...current, directionOptionId: value }))}>
              <SelectTrigger data-testid="select-trigger-direction"><SelectValue placeholder="ثبت نشده" /></SelectTrigger><SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{directions.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
            </Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">شرح تریگر</Label><Textarea rows={2} value={triggerDraft.description} onChange={event => setTriggerDraft(current => ({ ...current, description: event.target.value }))} data-testid="input-trigger-description" /></div>
            <div className="space-y-1.5"><Label className="text-xs">حرکت قیمت و واکنش بازار</Label><Textarea rows={2} value={triggerDraft.marketMovement} onChange={event => setTriggerDraft(current => ({ ...current, marketMovement: event.target.value }))} data-testid="input-trigger-market-movement" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">یادداشت تریگر</Label><Textarea rows={2} value={triggerDraft.notes} onChange={event => setTriggerDraft(current => ({ ...current, notes: event.target.value }))} data-testid="input-trigger-notes" /></div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={triggerDraft.confirmed} onChange={event => setTriggerDraft(current => ({ ...current, confirmed: event.target.checked }))} data-testid="checkbox-trigger-confirmed" />تریگر تأیید شده است</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void createTrigger(false)} disabled={triggerSaving || !triggerDraft.timeframeOptionId} data-testid="button-save-trigger"><Plus className="ml-2 h-4 w-4" />ثبت تریگر</Button>
            <Button type="button" onClick={() => void createTrigger(true)} disabled={triggerSaving || !triggerDraft.timeframeOptionId || !triggerDraft.confirmed} className="gap-2" data-testid="button-trigger-to-trade"><Target className="h-4 w-4" />{triggerSaving ? 'در حال ثبت…' : 'ثبت تریگر و ادامه به معامله'}</Button>
          </div>
        </CardContent>
      </Card>
      <Card className="tradermind-card overflow-hidden" data-testid="list-trigger-events">
        {triggers.length === 0 ? <CardContent className="p-5 text-center text-sm text-muted-foreground" data-testid="empty-trigger-events">تریگری ثبت نشده است.</CardContent> : <div className="divide-y divide-border/70">
          {triggers.map(trigger => <div key={trigger.id} className="p-4" data-testid={`row-trigger-${trigger.id}`}>
            {editingTriggerId === trigger.id ? (
              <div className="space-y-3" data-testid={`form-edit-trigger-${trigger.id}`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs">بازهٔ زمانی</Label><Select value={triggerEditDraft.timeframeOptionId} onValueChange={value => setTriggerEditDraft(current => ({ ...current, timeframeOptionId: value }))}>
                    <SelectTrigger data-testid={`select-edit-trigger-timeframe-${trigger.id}`}><SelectValue /></SelectTrigger><SelectContent>{timeframes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">تحلیل‌های مرتبط</Label>
                    <div className="flex flex-wrap gap-2" data-testid={`list-edit-trigger-analysis-${trigger.id}`}>
                      {analyses.map(analysis => {
                        const selected = triggerEditDraft.analysisEventIds.includes(analysis.id);
                        return <button key={analysis.id} type="button" aria-pressed={selected}
                          onClick={() => setTriggerEditDraft(current => ({ ...current, analysisEventIds: selected ? current.analysisEventIds.filter(id => id !== analysis.id) : [...current.analysisEventIds, analysis.id] }))}
                          className={`rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                          data-testid={`toggle-edit-trigger-analysis-${trigger.id}-${analysis.id}`}>{optionLabel(analysis.timeframeOptionId, 'تحلیل')}</button>;
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">نوع تریگر</Label><Select value={triggerEditDraft.triggerTypeOptionId} onValueChange={value => setTriggerEditDraft(current => ({ ...current, triggerTypeOptionId: value }))}>
                    <SelectTrigger data-testid={`select-edit-trigger-type-${trigger.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{triggerTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">جهت</Label><Select value={triggerEditDraft.directionOptionId} onValueChange={value => setTriggerEditDraft(current => ({ ...current, directionOptionId: value }))}>
                    <SelectTrigger data-testid={`select-edit-trigger-direction-${trigger.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">ثبت نشده</SelectItem>{directions.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs">شرح تریگر</Label><Textarea rows={2} value={triggerEditDraft.description} onChange={event => setTriggerEditDraft(current => ({ ...current, description: event.target.value }))} data-testid={`input-edit-trigger-description-${trigger.id}`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">حرکت قیمت و واکنش بازار</Label><Textarea rows={2} value={triggerEditDraft.marketMovement} onChange={event => setTriggerEditDraft(current => ({ ...current, marketMovement: event.target.value }))} data-testid={`input-edit-trigger-market-movement-${trigger.id}`} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">یادداشت تریگر</Label><Textarea rows={2} value={triggerEditDraft.notes} onChange={event => setTriggerEditDraft(current => ({ ...current, notes: event.target.value }))} data-testid={`input-edit-trigger-notes-${trigger.id}`} /></div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={triggerEditDraft.confirmed} onChange={event => setTriggerEditDraft(current => ({ ...current, confirmed: event.target.checked }))} data-testid={`checkbox-edit-trigger-confirmed-${trigger.id}`} />تریگر تأیید شده است</label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void saveTriggerEdit(trigger.id)} disabled={triggerEditSaving} className="gap-2" data-testid={`button-save-trigger-edit-${trigger.id}`}><Save className="h-4 w-4" />ذخیرهٔ تغییرات</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingTriggerId(null)} disabled={triggerEditSaving} className="gap-2" data-testid={`button-cancel-trigger-edit-${trigger.id}`}><X className="h-4 w-4" />انصراف</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{optionLabel(trigger.timeframeOptionId, 'بازهٔ زمانی حذف‌شده')}</Badge><Badge variant={trigger.status === 'converted' ? 'default' : 'secondary'}>{trigger.status === 'converted' ? 'متصل به معامله' : trigger.status === 'ignored' ? 'نادیده' : trigger.status === 'invalid' ? 'نامعتبر' : 'در انتظار'}</Badge><span className="text-xs text-muted-foreground">{optionLabel(trigger.triggerTypeOptionId, 'تریگر')}</span></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{trigger.description || 'بدون شرح'}</p>
                  {trigger.marketMovement && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{trigger.marketMovement}</p>}
                  {trigger.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{trigger.notes}</p>}
                  {triggerAnalysisIds(trigger).length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`row-trigger-analyses-${trigger.id}`}>
                    <span className="text-[10px] text-muted-foreground">تحلیل مرتبط:</span>
                    {triggerAnalysisIds(trigger).map(analysisId => {
                      const linked = analyses.find(item => item.id === analysisId);
                      return linked ? <Badge key={analysisId} variant="outline" className="text-[10px]">{optionLabel(linked.timeframeOptionId, 'تحلیل')}</Badge> : null;
                    })}
                  </div>}
                  <p className="mt-1 text-[10px] text-muted-foreground">{localDate(trigger.createdAt)} · {trigger.confirmed ? 'تأییدشده' : 'تأییدنشده'}</p>
                  <div className="mt-3"><JournalMediaStrip session={bundle.session} triggerId={trigger.id} media={media} onChanged={reloadSilent} title="عکس تریگر" testIdPrefix={`trigger-${trigger.id}`} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => beginTriggerEdit(trigger.id)} className="gap-1.5" data-testid={`button-edit-trigger-${trigger.id}`}><Pencil className="h-3.5 w-3.5" />ویرایش</Button>
                  {!trigger.linkedTradeId ? <Select value={trigger.status} onValueChange={value => void updateTriggerStatus(trigger.id, value as 'pending' | 'ignored' | 'invalid')}>
                    <SelectTrigger className="h-8 w-32 text-xs" data-testid={`select-trigger-status-${trigger.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pending">در انتظار</SelectItem><SelectItem value="ignored">نادیده</SelectItem><SelectItem value="invalid">نامعتبر</SelectItem></SelectContent>
                  </Select> : <Link href={`/journal/trades/${trigger.linkedTradeId}`} className="rounded-md border px-3 py-2 text-xs text-primary" data-testid={`link-trigger-trade-${trigger.id}`}>مشاهدهٔ معامله</Link>}
                  {!trigger.linkedTradeId && <Button type="button" size="sm" variant="outline" disabled={!trigger.confirmed} onClick={() => setLocation(`/journal/trades/new?journalSessionId=${encodeURIComponent(sessionId)}&journalTriggerId=${encodeURIComponent(trigger.id)}&returnTo=${encodeURIComponent(`/journal/sessions/${sessionId}`)}`)} data-testid={`button-start-trigger-trade-${trigger.id}`}>ثبت معامله</Button>}
                </div>
              </div>
            )}
          </div>)}
        </div>}
      </Card>
    </section>

    <section className="grid items-start gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card className="tradermind-card" data-testid="card-session-review">
        <div className="border-b border-border/70 px-5 py-4"><h2 className="font-semibold">مرور و جمع‌بندی</h2><p className="mt-1 text-xs text-muted-foreground">یادداشت‌های سشن پس از پایان نیز در همین دستگاه می‌مانند.</p></div>
        <CardContent className="p-5">
          <form onSubmit={saveSession} className="space-y-4" data-testid="form-session-review">
            <div className="space-y-1.5"><Label htmlFor="edit-session-notes">یادداشت زمینهٔ سشن</Label><Textarea id="edit-session-notes" rows={3} value={sessionDraft.notes} onChange={event => setSessionDraft(current => ({ ...current, notes: event.target.value }))} data-testid="input-review-session-notes" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="review-lessons">درس‌های آموخته‌شده</Label><Textarea id="review-lessons" rows={3} value={sessionDraft.lessonsLearned} onChange={event => setSessionDraft(current => ({ ...current, lessonsLearned: event.target.value }))} data-testid="input-lessons-learned" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-mistakes">مرور اشتباه‌ها</Label><Textarea id="review-mistakes" rows={3} value={sessionDraft.mistakesReview} onChange={event => setSessionDraft(current => ({ ...current, mistakesReview: event.target.value }))} data-testid="input-mistakes-review" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-psych">مرور روان‌شناختی</Label><Textarea id="review-psych" rows={3} value={sessionDraft.psychologicalReview} onChange={event => setSessionDraft(current => ({ ...current, psychologicalReview: event.target.value }))} data-testid="input-psychological-review" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-observations">مشاهدات استراتژی</Label><Textarea id="review-observations" rows={3} value={sessionDraft.strategyObservations} onChange={event => setSessionDraft(current => ({ ...current, strategyObservations: event.target.value }))} data-testid="input-strategy-observations" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="review-change-proposal">پیشنهاد تغییر استراتژی</Label><Textarea id="review-change-proposal" rows={2} value={sessionDraft.strategyChangeProposal} onChange={event => setSessionDraft(current => ({ ...current, strategyChangeProposal: event.target.value }))} data-testid="input-strategy-change-proposal" /></div>
             <div className="space-y-1.5"><Label htmlFor="review-session-quality">کیفیت کلی سشن (۰ تا ۱۰)</Label><Input id="review-session-quality" type="number" min={0} max={10} value={sessionDraft.sessionQuality ?? ''} onChange={event => setSessionDraft(current => ({ ...current, sessionQuality: event.target.value === '' ? null : Math.max(0, Math.min(10, Number(event.target.value))) }))} data-testid="input-session-quality" /></div>
             <div className="space-y-1.5"><Label htmlFor="review-final-reflection">بازتاب نهایی سشن</Label><Textarea id="review-final-reflection" rows={3} value={sessionDraft.finalReflection} onChange={event => setSessionDraft(current => ({ ...current, finalReflection: event.target.value }))} data-testid="input-session-final-reflection" /></div>
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full space-y-1.5 sm:max-w-52"><Label>وضعیت سشن</Label><Select value={sessionDraft.status} onValueChange={value => setSessionDraft(current => ({ ...current, status: value as typeof current.status }))}>
                <SelectTrigger data-testid="select-session-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">در جریان</SelectItem><SelectItem value="completed">تکمیل‌شده</SelectItem><SelectItem value="cancelled">لغوشده</SelectItem></SelectContent>
              </Select></div>
              <Button type="submit" disabled={saving} className="gap-2" data-testid="button-save-session-review"><Save className="h-4 w-4" />ذخیرهٔ مرور و وضعیت</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="tradermind-card" data-testid="card-no-trade-events">
          <div className="border-b border-border/70 px-4 py-3"><h2 className="font-semibold">رویدادهای بدون معامله</h2><p className="mt-1 text-xs text-muted-foreground">فرصت‌های دیده‌شده، ازدست‌رفته یا نامعتبر را ثبت کنید.</p></div>
          <CardContent className="space-y-4 p-4">
            {eventTypes.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground" data-testid="empty-event-types">نوع رویداد فعالی وجود ندارد؛ گزینهٔ غیرفعال به رویداد جدید تبدیل نمی‌شود.</div> : <form onSubmit={addEvent} className="space-y-3" data-testid="form-add-session-event">
              <div className="space-y-1.5"><Label className="text-xs">نوع رویداد</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger data-testid="select-event-type"><SelectValue placeholder="انتخاب نوع" /></SelectTrigger><SelectContent>{eventTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">زمان</Label><Input type="datetime-local" value={eventTime} onChange={event => setEventTime(event.target.value)} data-testid="input-event-time" /></div>
              <Textarea rows={2} placeholder="چه دیدید و چرا معامله نکردید؟" value={eventNotes} onChange={event => setEventNotes(event.target.value)} data-testid="input-event-notes" />
              <Button size="sm" className="w-full gap-2" disabled={eventSaving || !eventType} data-testid="button-add-event"><Plus className="h-4 w-4" />ثبت رویداد</Button>
            </form>}
            <div className="space-y-2">
              {bundle.events.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground" data-testid="empty-session-events">هنوز رویدادی ثبت نشده است.</p> : bundle.events.map(event => <div key={event.id} className="flex items-start justify-between gap-2 rounded-lg border border-border/70 p-3" data-testid={`row-event-${event.id}`}>
                <div className="min-w-0"><div className="text-sm font-medium">{bundleOptions.find(option => option.id === event.typeOptionId)?.label ?? 'نوع حذف‌شده'}</div><div className="mt-1 text-[10px] text-muted-foreground">{localDate(event.eventAt)}</div>{event.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{event.notes}</p>}</div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label="حذف رویداد" onClick={() => void removeEvent(event.id)} disabled={busyEventId === event.id} data-testid={`button-delete-event-${event.id}`}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
            </div>
          </CardContent>
        </Card>

        <Card className="tradermind-card" data-testid="card-session-media">
          <div className="border-b border-border/70 px-4 py-3"><h2 className="font-semibold">فایل‌های پشتیبان</h2><p className="mt-1 text-xs text-muted-foreground">تصویر، ویدیو و فایل‌های دیگر در دیتابیس محلی ذخیره می‌شوند.</p></div>
          <CardContent className="space-y-4 p-4">
            <form onSubmit={addMedia} className="space-y-3" data-testid="form-add-session-media">
              <div className="space-y-1.5"><Label htmlFor="session-media-file" className="text-xs">فایل</Label><Input id="session-media-file" type="file" onChange={event => setFile(event.target.files?.[0] ?? null)} data-testid="input-session-media-file" /></div>
              <div className="space-y-1.5"><Label className="text-xs">اتصال به</Label><Select value={attachmentAnalysisId} onValueChange={setAttachmentAnalysisId}><SelectTrigger data-testid="select-media-target"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="session">خود سشن</SelectItem>{analyses.map(analysis => <SelectItem key={analysis.id} value={`analysis:${analysis.id}`}>{optionLabel(analysis.timeframeOptionId, 'تحلیل تایم‌فریم')} · تحلیل</SelectItem>)}{triggers.map(trigger => <SelectItem key={trigger.id} value={`trigger:${trigger.id}`}>{optionLabel(trigger.timeframeOptionId, 'تایم‌فریم')} · تریگر</SelectItem>)}</SelectContent></Select></div>
              <Input placeholder="شرح کوتاه فایل (اختیاری)" value={fileCaption} onChange={event => setFileCaption(event.target.value)} data-testid="input-media-caption" />
              <Button type="submit" variant="outline" className="w-full gap-2" disabled={mediaSaving || !file} data-testid="button-save-media"><Paperclip className="h-4 w-4" />{mediaSaving ? 'در حال ذخیره…' : 'افزودن پیوست'}</Button>
            </form>
            {media.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground" data-testid="empty-session-media">هنوز فایلی به سشن وصل نشده است.</div> : <div className="space-y-2">
              {media.map(item => {
                const attachedAnalysis = item.analysisId ? analyses.find(analysis => analysis.id === item.analysisId) : undefined;
                const attachedTrigger = item.triggerId ? triggers.find(trigger => trigger.id === item.triggerId) : undefined;
                const Icon = item.mimeType.startsWith('image/') ? ImageIcon : item.mimeType.startsWith('video/') ? Film : FilePlus2;
                return <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3" data-testid={`row-media-${item.id}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => openMedia(item)} data-testid={`button-open-media-${item.id}`}><span className="block truncate text-sm font-medium">{item.fileName}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.caption || (attachedAnalysis ? optionLabel(attachedAnalysis.timeframeOptionId, 'پیوست تحلیل') : attachedTrigger ? `تریگر ${optionLabel(attachedTrigger.timeframeOptionId, '')}` : 'پیوست سشن')}</span></button>
                  <Button variant="ghost" size="icon" aria-label="حذف پیوست" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void removeMedia(item.id)} disabled={busyMediaId === item.id} data-testid={`button-delete-media-${item.id}`}><Trash2 className="h-4 w-4" /></Button>
                </div>;
              })}
            </div>}
          </CardContent>
        </Card>
      </div>
    </section>

    <section className="space-y-3" aria-labelledby="linked-trades-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">EXECUTION LOG</p><h2 id="linked-trades-heading" className="mt-1 text-xl font-semibold">معاملات متصل</h2></div><Badge variant="outline" data-testid="text-linked-trade-count">{bundle.trades.length} معامله</Badge></div>
      {bundle.trades.length === 0 ? <Card className="border-dashed bg-card/50" data-testid="empty-linked-trades"><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <Target className="h-7 w-7 text-muted-foreground/70" /><h3 className="font-semibold">هنوز معامله‌ای به این سشن وصل نیست</h3><p className="max-w-md text-sm leading-6 text-muted-foreground">وقتی آمادهٔ اجرا هستید، فرم ثبت معامله را از اینجا باز کنید تا پیوند سشن حفظ شود.</p>
              <Button onClick={scrollToTrigger} className="gap-2" data-testid="button-first-linked-trade"><Plus className="h-4 w-4" />شروع ثبت معامله</Button>
      </CardContent></Card> : <Card className="tradermind-card overflow-hidden">
        <div className="divide-y divide-border/70">{bundle.trades.map(trade => {
          const resultLabel = trade.status === 'open' ? 'باز' : trade.result === 'win' || trade.result === 'partial-win' ? 'سود' : trade.result === 'loss' || trade.result === 'partial-loss' ? 'زیان' : trade.result === 'cancelled' ? 'لغوشده' : 'سر به سر';
          const pnl = trade.profitLoss;
          return <div key={trade.id} className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5" data-testid={`row-linked-trade-${trade.id}`}>
            <Link href={`/journal/trades/${trade.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4 py-1" data-testid={`link-linked-trade-${trade.id}`}>
              <span className="flex min-w-0 items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${trade.direction === 'long' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>{trade.direction === 'long' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</span>
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-semibold"><span>{trade.symbol}</span><Badge variant="outline" className="text-[10px]">{directionName(trade)}</Badge><Badge variant={trade.status === 'open' ? 'secondary' : 'outline'} className="text-[10px]">{resultLabel}</Badge></span><span className="mt-1 block text-xs text-muted-foreground">{localDate(trade.openedAt)}{trade.rMultiple != null ? ` · ${money(trade.rMultiple)}R` : ''}</span></span>
              </span>
              <span className={`shrink-0 text-left font-mono text-sm font-semibold ${pnl == null ? 'text-muted-foreground' : pnl >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{pnl == null ? '—' : money(pnl)}</span>
            </Link>
            <Link href={`/journal/trades/${trade.id}/journal`} className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5" data-testid={`link-trade-review-${trade.id}`}>مرور ژورنال</Link>
          </div>;
        })}</div>
      </Card>}
    </section>
    <div className="flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />سوابق سشن و پیوست‌ها روی همین دستگاه نگهداری می‌شوند.</div>
  </main>;
}