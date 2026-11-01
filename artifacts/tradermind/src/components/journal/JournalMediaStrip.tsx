import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { journalSessionService } from '../../services/journalSessionService';
import { deleteScreenshotForMedia, saveJournalMediaScreenshot } from '../../services/screenshotIntelligenceService';
import type { JournalMedia, JournalSession } from '../../db/database';
import StoredImage from '../StoredImage';
import { Button } from '../ui/button';

interface JournalMediaStripProps {
  session: JournalSession;
  /** فقط یکی از این دو را بدهید: عکس‌ها به همین رویداد تحلیل یا همین تریگر وصل می‌شوند. */
  analysisId?: string;
  triggerId?: string;
  /** همهٔ پیوست‌های سشن؛ خود کامپوننت موارد مربوط به این تحلیل/تریگر را جدا می‌کند. */
  media: JournalMedia[];
  onChanged: () => void | Promise<void>;
  title?: string;
  testIdPrefix: string;
}

/**
 * نوار عکس‌های چارت و اسکرین‌شات که مستقیم زیر کادر هر تایم‌فریم (یا تریگر)
 * قرار می‌گیرد. هر عکس هم در سشن و هم در کتابخانهٔ اسکرین‌شات ذخیره می‌شود.
 */
export function JournalMediaStrip({
  session, analysisId, triggerId, media, onChanged, title = 'عکس چارت و اسکرین‌شات', testIdPrefix,
}: JournalMediaStripProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState('');

  const items = media.filter(item => analysisId ? item.analysisId === analysisId : item.triggerId === triggerId);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    let screenshotWarning = false;
    try {
      for (const file of files) {
        const saved = await journalSessionService.saveMedia({
          sessionId: session.id,
          analysisId: analysisId ?? undefined,
          triggerId: triggerId ?? undefined,
          category: analysisId ? 'analysis' : 'trigger',
          file,
          caption: '',
        });
        if (file.type.startsWith('image/')) {
          try { await saveJournalMediaScreenshot(saved, session); } catch { screenshotWarning = true; }
        }
      }
      toast.success(files.length > 1 ? `${files.length} عکس ذخیره شد.` : 'عکس ذخیره شد.');
      if (screenshotWarning) toast.warning('عکس‌ها در سشن ذخیره شدند، اما افزودن به کتابخانهٔ اسکرین‌شات انجام نشد.');
      await onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ عکس انجام نشد.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (mediaId: string) => {
    setBusyId(mediaId);
    try {
      await journalSessionService.deleteMedia(mediaId);
      await deleteScreenshotForMedia(mediaId);
      await onChanged();
      toast.success('عکس حذف شد.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'حذف عکس انجام نشد.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3" data-testid={`${testIdPrefix}-media`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}{items.length ? ` · ${items.length.toLocaleString('fa-IR')}` : ''}</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void handleFiles(event)} data-testid={`${testIdPrefix}-media-input`} />
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()} data-testid={`${testIdPrefix}-media-add`}>
          <ImagePlus className="h-3.5 w-3.5" />{uploading ? 'در حال ذخیره…' : 'افزودن عکس'}
        </Button>
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid={`${testIdPrefix}-media-list`}>
          {items.map(item => (
            <div key={item.id} className="group relative aspect-video overflow-hidden rounded-md border border-border/70 bg-background" data-testid={`${testIdPrefix}-media-${item.id}`}>
              {item.mimeType.startsWith('image/')
                ? <StoredImage source={item.blob} enableViewer showDownload filename={item.fileName} alt={item.caption || item.fileName} className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">{item.fileName}</div>}
              <Button type="button" size="icon" variant="secondary" aria-label="حذف عکس" disabled={busyId === item.id}
                className="absolute right-1 top-1 h-7 w-7 opacity-90" onClick={() => void remove(item.id)} data-testid={`${testIdPrefix}-media-delete-${item.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
