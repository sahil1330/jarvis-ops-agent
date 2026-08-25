import { useEffect, useRef, useState } from 'react';

const WORD_DELAY_MS = 185;
const SENTENCE_DELAY_MS = 105;

function nextWordEnd(text: string, start: number, streamActive: boolean): number | null {
  if (start >= text.length) return null;
  const remaining = text.slice(start);
  const match = /^\s*\S+/.exec(remaining);
  if (!match) return null;

  let end = start + match[0].length;
  const hasCompleteWord = end < text.length || /[.!?,;:]$/.test(match[0]);
  if (streamActive && !hasCompleteWord) return null;
  while (end < text.length && /\s/.test(text[end] ?? '')) end += 1;
  return end;
}

export function useConversationalReveal(text: string, streamActive: boolean): string {
  const [visibleLength, setVisibleLength] = useState(0);
  const textRef = useRef(text);
  const streamActiveRef = useRef(streamActive);
  const visibleLengthRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const revealNextWordRef = useRef<() => void>(() => undefined);
  const loopReadyRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  useEffect(() => {
    const previous = textRef.current;
    textRef.current = text;
    streamActiveRef.current = streamActive;

    if (!text.startsWith(previous.slice(0, visibleLengthRef.current))) {
      visibleLengthRef.current = 0;
      setVisibleLength(0);
    }

    if (reducedMotionRef.current) {
      visibleLengthRef.current = text.length;
      setVisibleLength(text.length);
      return;
    }

    if (loopReadyRef.current && timerRef.current === null && visibleLengthRef.current < text.length) {
      timerRef.current = window.setTimeout(revealNextWordRef.current, 0);
    }
  }, [streamActive, text]);

  useEffect(() => {
    const revealNextWord = () => {
      timerRef.current = null;
      const target = textRef.current;
      const current = visibleLengthRef.current;
      const next = nextWordEnd(target, current, streamActiveRef.current);
      if (next === null) return;

      visibleLengthRef.current = next;
      setVisibleLength(next);
      const revealedWord = target.slice(current, next).trimEnd();
      const punctuationPause = /[.!?]$/.test(revealedWord) ? SENTENCE_DELAY_MS : 0;
      timerRef.current = window.setTimeout(revealNextWord, WORD_DELAY_MS + punctuationPause);
    };

    revealNextWordRef.current = revealNextWord;
    loopReadyRef.current = true;
    if (visibleLengthRef.current < textRef.current.length) {
      timerRef.current = window.setTimeout(revealNextWord, 0);
    }
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      loopReadyRef.current = false;
    };
  }, []);

  return text.slice(0, visibleLength);
}
