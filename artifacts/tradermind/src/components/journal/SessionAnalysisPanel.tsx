import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import StoredImage from '../StoredImage';
import { journalSessionService, parseJournalArray, triggerAnalysisIds, type JournalSessionBundle } from '../../services/journalSessionService';
import { getJournalAnalysisFieldLabels, parseAnalysisFieldSelections } from '../../services/journalAnalysisFieldLabels';
import type { JournalMedia, JournalSessionAnalysis } from '../../db/database';

interface SessionAnalysisPanelProps {
  tradeId: string;
  journalSessionId?: string | null;
}

const TEXT_FIELDS = [
  'analysisText', 'marketContext', 'momentumText', 'pricePositionText', 'directionLogicText',
  'scenario', 'triggerContext', 'zones', 'notes',
] as const;

function MediaGrid({ items }: { items: JournalMedia[] }) {
  const images = items.filter(item => item.mimeType.startsWith('image/'));
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map(item => (
        <div key={item.id} className="aspect-video overflow-hidden rounded-md border border-border/70 bg-background">
          <StoredImage source={item.blob} enableViewer showDownload filename={item.fileName} alt={item.caption || item.fileName} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

/**
 * تحلیل‌های چندبازه‌ای و تریگر ثبت‌شده در سشن معاملاتی را (فقط‌خواندنی، همراه با عکس‌ها)
 * در صفحهٔ بازبینی معامله نشان می‌دهد.
 */
export function SessionAnalysisPanel({ tradeId, journalSessionId }: SessionAnalysisPanelProps) {
  const [bundle, setBundle] = useState<JournalSessionBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!journalSessionId) { setBundle(null); return; }
    journalSessionService.getBundle(journalSessionId)
      .then(result => { if (!cancelled) setBundle(result ?? null); })
      .catch(() => { if (!cancelled) setBundle(null); });
    return () => { cancelled = true; };
  }, [journalSessionId, tradeId]);

  if (!bundle) return null;

  const labels = getJournalAnalysisFieldLabels();
  const optionLabel = (id?: string | null) => bundle.options.find(option => option.id === id)?.label ?? '';
  const trigger = bundle.triggers.find(item => item.linkedTradeId === tradeId);
  const linkedIds = trigger ? triggerAnalysisIds(trigger) : [];
  const analyses: JournalSessionAnalysis[] = linkedIds.length
    ? bundle.analyses.filter(item => linkedIds.includes(item.id))
    : bundle.analyses;
  const sessionTitle = optionLabel(bundle.session.sessionTypeOptionId);

  if (analyses.length === 0 && !trigger) return null;

  return (
    <Card data-testid="card-trade-session-analyses">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          تحلیل‌های چندبازه‌ای سشن
          <Badge variant="outline" className="py-0 text-[10px]">{analyses.length.toLocaleString('fa-IR')}</Badge>
          <Link href={`/journal/sessions/${bundle.session.id}`} className="mr-auto text-xs font-normal text-primary hover:underline">
            {sessionTitle ? `مشاهدهٔ سشن (${sessionTitle})` : 'مشاهدهٔ سشن'}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {analyses.map(analysis => {
          const selections = parseAnalysisFieldSelections(analysis.fieldSelections);
          const tags = parseJournalArray(analysis.tags);
          const media = bundle.media.filter(item => item.analysisId === analysis.id);
          return (
            <div key={analysis.id} className="space-y-3 rounded-lg border border-border/70 p-3" data-testid={`trade-analysis-${analysis.id}`}>
              <div className="flex items-center gap-2">
                <Badge>{optionLabel(analysis.timeframeOptionId) || 'تایم‌فریم'}</Badge>
              </div>
              {TEXT_FIELDS.map(key => {
                const text = (analysis[key] ?? '').toString().trim();
                const picked = (selections as Record<string, string[] | undefined>)[key] ?? [];
                if (!text && picked.length === 0) return null;
                return (
                  <div key={key} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{labels[key]}</p>
                    {picked.length > 0 && <div className="flex flex-wrap gap-1">{picked.map(item => <Badge key={item} variant="secondary" className="text-[11px]">{item}</Badge>)}</div>}
                    {text && <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>}
                  </div>
                );
              })}
              {tags.length > 0 && <div className="flex flex-wrap gap-1">{tags.map(tag => <Badge key={tag} variant="outline" className="text-[11px]">{tag}</Badge>)}</div>}
              <MediaGrid items={media} />
            </div>
          );
        })}
        {trigger && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3" data-testid="trade-linked-trigger">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">تریگر</Badge>
              <span className="text-xs text-muted-foreground">{optionLabel(trigger.timeframeOptionId)}</span>
              {optionLabel(trigger.triggerTypeOptionId) && <span className="text-xs text-muted-foreground">· {optionLabel(trigger.triggerTypeOptionId)}</span>}
            </div>
            {trigger.description && <p className="whitespace-pre-wrap text-sm leading-6">{trigger.description}</p>}
            {trigger.marketMovement && <div><p className="text-xs font-medium text-muted-foreground">حرکت قیمت و واکنش بازار</p><p className="whitespace-pre-wrap text-sm leading-6">{trigger.marketMovement}</p></div>}
            {trigger.notes && <div><p className="text-xs font-medium text-muted-foreground">یادداشت تریگر</p><p className="whitespace-pre-wrap text-sm leading-6">{trigger.notes}</p></div>}
            <MediaGrid items={bundle.media.filter(item => item.triggerId === trigger.id)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
