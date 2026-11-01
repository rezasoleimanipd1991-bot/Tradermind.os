import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '../db/database';
import type { TradeScreenshot } from '../types/screenshot';
import ScreenshotManager from './ScreenshotManager';

vi.mock('../lib/imageCompression', () => ({
  compressImage: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,aGVsbG8=' })),
}));

vi.mock('../services/visualAnalysisService', () => ({
  assessImageQuality: vi.fn(async (_dataUrl: string, fileSize: number) => ({
    score: 90,
    width: 1200,
    height: 800,
    fileSize,
    issues: [],
    confidence: 'high',
  })),
  extractInitialFeatures: vi.fn(() => []),
  findSimilarScreenshots: vi.fn(() => []),
  compareUserTextWithVisualFeatures: vi.fn(() => null),
  analyzeMTFRelationship: vi.fn(() => ({ higherTFSignal: null, intermediateTFSignal: null, entryTFSignal: null, executionTFSignal: null, alignment: null, notes: null })),
  generateAnalysisNotes: vi.fn(() => ''),
  compareLifecycleScreenshots: vi.fn(() => ({ before: [], during: [], after: [] })),
}));

vi.mock('../services/screenshotIntelligenceService', () => ({
  saveTradeScreenshotToLibrary: vi.fn(async () => ({ id: 'library-screenshot-1' })),
  deleteChartScreenshot: vi.fn(async () => undefined),
}));

vi.mock('./AnnotationCanvas', () => ({ default: () => null }));
vi.mock('./VisualFeatureEditor', () => ({ default: () => null }));
vi.mock('./VisualComparisonView', () => ({ default: () => null }));
vi.mock('./VisualSimilarityPanel', () => ({ default: () => null }));
vi.mock('./MTFSequenceView', () => ({ default: () => null }));
vi.mock('./StoredImage', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));

function ScreenshotHarness() {
  const [screenshots, setScreenshots] = useState<TradeScreenshot[]>([]);
  const trade = useMemo(() => ({
    id: 'trade-e2e',
    symbol: 'EURUSD',
    direction: 'long',
    openedAt: Date.now(),
    screenshots: JSON.stringify(screenshots),
    notes: '',
  }) as unknown as Trade, [screenshots]);

  return (
    <>
      <output aria-label="library screenshot id">{screenshots[0]?.libraryScreenshotId ?? ''}</output>
      <ScreenshotManager trade={trade} onChange={setScreenshots} />
    </>
  );
}

describe('ScreenshotManager capture flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('uploads a web image and links the saved trade screenshot to Screenshot Intelligence', async () => {
    const { container } = render(<ScreenshotHarness />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [new File(['chart'], 'chart.png', { type: 'image/png' })] } });

    await waitFor(() => expect(screen.getByLabelText('library screenshot id').textContent).toBe('library-screenshot-1'));
  });

  it('captures in Electron, confirms the preview, and saves to the same library path', async () => {
    const captureScreen = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      sourceName: 'Trading chart',
    }));
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true, captureScreen },
    });

    render(<ScreenshotHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'گرفتن اسکرین‌شات' }));
    await waitFor(() => expect(captureScreen).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و ذخیره' }));

    await waitFor(() => expect(screen.getByLabelText('library screenshot id').textContent).toBe('library-screenshot-1'));
  });
});
