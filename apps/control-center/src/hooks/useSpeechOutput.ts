import { useCallback, useEffect, useRef, useState } from 'react';
import { createSpeech } from '../lib/api';

function browserSpeak(text: string): boolean {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.96;
  utterance.pitch = 0.92;
  utterance.lang = 'en-GB';
  window.speechSynthesis.speak(utterance);
  return true;
}

export function useSpeechOutput(neuralAvailable = false) {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSpokenRef = useRef('');

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(async (rawText: string) => {
    const text = rawText.trim().replace(/\s+/g, ' ').slice(0, 4_096);
    if (!enabled || !text || text === lastSpokenRef.current) return;
    lastSpokenRef.current = text;
    stop();

    if (!neuralAvailable) {
      setSpeaking(browserSpeak(text));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSpeaking(true);
    try {
      const blob = await createSpeech(text, controller.signal);
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = stop;
      audio.onerror = () => {
        stop();
        browserSpeak(text);
      };
      await audio.play();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      stop();
      browserSpeak(text);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [enabled, neuralAvailable, stop]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      if (current) stop();
      return !current;
    });
  }, [stop]);

  return { enabled, speaking, speak, stop, toggle };
}
