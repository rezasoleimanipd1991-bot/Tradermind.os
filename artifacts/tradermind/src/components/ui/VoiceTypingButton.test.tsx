import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Input } from './input';
import { VoiceTypingButton } from './VoiceTypingButton';

class MockRecognition {
  static instances: MockRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());

  constructor() {
    MockRecognition.instances.push(this);
  }
}

function ControlledInput() {
  const [value, setValue] = useState('');
  return <Input aria-label="یادداشت" value={value} onChange={event => setValue(event.target.value)} />;
}

describe('voice typing', () => {
  beforeEach(() => {
    MockRecognition.instances = [];
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: MockRecognition,
    });
  });

  afterEach(() => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it('inserts Persian speech into a text field and lets the user stop the microphone', () => {
    render(<ControlledInput />);

    fireEvent.click(screen.getByRole('button', { name: 'شروع تایپ صوتی فارسی' }));
    const recognition = MockRecognition.instances[0];
    expect(recognition.lang).toBe('fa-IR');
    expect(recognition.start).toHaveBeenCalledOnce();

    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'ورود سریع' } }],
      });
    });

    expect((screen.getByRole('textbox', { name: 'یادداشت' }) as HTMLInputElement).value).toBe('ورود سریع');
    const stopButton = screen.getByRole('button', { name: 'توقف تایپ صوتی' });
    fireEvent.click(stopButton);
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'شروع تایپ صوتی فارسی' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('does not add voice typing to numeric text inputs', () => {
    render(<Input aria-label="قیمت" inputMode="decimal" />);
    expect(screen.queryByRole('button', { name: 'شروع تایپ صوتی فارسی' })).toBeNull();
  });

  it('adds voice typing to email and URL text fields', () => {
    render(
      <div>
        <Input type="email" aria-label="ایمیل" />
        <Input type="url" aria-label="آدرس" />
      </div>,
    );
    expect(screen.getAllByRole('button', { name: 'شروع تایپ صوتی فارسی' })).toHaveLength(2);
  });

  it('finds a nearby raw text input when a shared Input wrapper is not used', () => {
    render(
      <div>
        <VoiceTypingButton />
        <input aria-label="یادداشت خام" />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'شروع تایپ صوتی فارسی' }));
    const recognition = MockRecognition.instances[0];
    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'یادداشت صوتی' } }],
      });
    });

    expect((screen.getByRole('textbox', { name: 'یادداشت خام' }) as HTMLInputElement).value).toBe('یادداشت صوتی');
  });
});
