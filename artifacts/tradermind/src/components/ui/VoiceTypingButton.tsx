import { useEffect, useRef, useState, type RefObject } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => RecognitionInstance;

let activeRecognition: { owner: symbol; instance: RecognitionInstance } | null = null;

function getRecognitionConstructor(): RecognitionConstructor | undefined {
  const browser = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

function insertTranscript(target: HTMLInputElement | HTMLTextAreaElement, transcript: string) {
  const clean = transcript.trim();
  if (!clean) return;

  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const next = `${before}${leadingSpace}${clean}${trailingSpace}${after}`;
  const cursor = before.length + leadingSpace.length + clean.length;

  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(target, next);
  target.focus();
  target.setSelectionRange(cursor, cursor);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

export function VoiceTypingButton({
  targetRef,
}: {
  targetRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const [listening, setListening] = useState(false);
  const ownerRef = useRef(Symbol('voice-input'));
  const instanceRef = useRef<RecognitionInstance | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const resolveTarget = () => {
    if (targetRef?.current) return targetRef.current;
    const selector = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"]';
    for (let ancestor = buttonRef.current?.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const target = [...ancestor.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)]
        .find(candidate => !candidate.disabled && !candidate.readOnly);
      if (target) return target;
    }
    return null;
  };

  const stop = () => {
    const instance = instanceRef.current;
    if (!instance) return;
    instanceRef.current = null;
    if (activeRecognition?.owner === ownerRef.current) activeRecognition = null;
    setListening(false);
    try { instance.stop(); } catch { /* It may already have stopped. */ }
  };

  useEffect(() => () => {
    const instance = instanceRef.current;
    if (instance && activeRecognition?.owner === ownerRef.current) activeRecognition = null;
    instanceRef.current = null;
    try { instance?.stop(); } catch { /* Ignore cleanup after browser shutdown. */ }
  }, []);

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      toast.error('تایپ صوتی در این مرورگر پشتیبانی نمی‌شود. از Chrome یا مرورگر سازگار استفاده کنید.');
      return;
    }
    const target = resolveTarget();
    if (!target) return;

    if (activeRecognition && activeRecognition.owner !== ownerRef.current) {
      try { activeRecognition.instance.stop(); } catch { /* The previous input may already have stopped. */ }
      activeRecognition = null;
    }

    const recognition = new Recognition();
    recognition.lang = 'fa-IR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const currentTarget = resolveTarget();
        if (result?.isFinal && currentTarget) {
          insertTranscript(currentTarget, result[0].transcript);
        }
      }
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error('اجازهٔ استفاده از میکروفون داده نشد.');
      } else if (event.error === 'network') {
        toast.error('سرویس تشخیص گفتار در دسترس نیست؛ اتصال اینترنت و مجوز میکروفون را بررسی کنید.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error('تایپ صوتی متوقف شد. اتصال میکروفون و مجوز مرورگر را بررسی کنید.');
      }
      if (activeRecognition?.owner === ownerRef.current) activeRecognition = null;
      instanceRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      if (activeRecognition?.owner === ownerRef.current) activeRecognition = null;
      instanceRef.current = null;
      setListening(false);
    };

    try {
      recognition.start();
      instanceRef.current = recognition;
      activeRecognition = { owner: ownerRef.current, instance: recognition };
      setListening(true);
    } catch {
      toast.error('میکروفون شروع نشد. مجوز مرورگر و اتصال میکروفون را بررسی کنید.');
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label={listening ? 'توقف تایپ صوتی' : 'شروع تایپ صوتی فارسی'}
      aria-pressed={listening}
      title={listening ? 'توقف تایپ صوتی' : 'تایپ صوتی فارسی؛ در بیشتر مرورگرها به اینترنت نیاز دارد'}
      className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] transition-colors ${
        listening
          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      <span>{listening ? 'خاموش' : 'تایپ صوتی'}</span>
    </button>
  );
}
