import { useCallback, useEffect, useRef, useState } from 'react';
import { createSpeech } from '../lib/api';

type SpeechQueueItem = {
  text: string;
  controller: AbortController | null;
  audio: Promise<Blob | null>;
};

function normalizeSpeechText(rawText: string): string {
  return rawText.trim().replace(/\s+/g, ' ').slice(0, 4_096);
}

export function useSpeechOutput(neuralAvailable = false) {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const enabledRef = useRef(true);
  const generationRef = useRef(0);
  const processingGenerationRef = useRef<number | null>(null);
  const queueRef = useRef<SpeechQueueItem[]>([]);
  const activeControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const browserResolveRef = useRef<(() => void) | null>(null);

  const cleanupCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    processingGenerationRef.current = null;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    for (const item of queueRef.current) item.controller?.abort();
    queueRef.current = [];
    cleanupCurrentAudio();
    browserResolveRef.current?.();
    browserResolveRef.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [cleanupCurrentAudio]);

  useEffect(() => stop, [stop]);

  const playBrowserSpeech = useCallback((text: string, generation: number): Promise<void> => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (generation !== generationRef.current || !enabledRef.current) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (browserResolveRef.current === finish) browserResolveRef.current = null;
        resolve();
      };
      browserResolveRef.current = finish;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.96;
      utterance.pitch = 0.92;
      utterance.lang = 'en-GB';
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const playNeuralSpeech = useCallback(async (blob: Blob, generation: number): Promise<boolean> => {
    if (generation !== generationRef.current || !enabledRef.current) return false;

    cleanupCurrentAudio();
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    const audio = new Audio(objectUrl);
    audioRef.current = audio;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (played: boolean) => {
        if (settled) return;
        settled = true;
        if (audioRef.current === audio) cleanupCurrentAudio();
        resolve(played);
      };

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      void audio.play().catch(() => finish(false));
    });
  }, [cleanupCurrentAudio]);

  const drainQueue = useCallback(async () => {
    const generation = generationRef.current;
    if (processingGenerationRef.current === generation) return;
    processingGenerationRef.current = generation;
    setSpeaking(true);

    try {
      while (
        enabledRef.current &&
        generation === generationRef.current &&
        queueRef.current.length > 0
      ) {
        const item = queueRef.current.shift();
        if (!item) break;
        activeControllerRef.current = item.controller;
        const blob = await item.audio;
        activeControllerRef.current = null;
        if (generation !== generationRef.current || !enabledRef.current) break;

        const playedNeural = blob ? await playNeuralSpeech(blob, generation) : false;
        if (!playedNeural && generation === generationRef.current && enabledRef.current) {
          await playBrowserSpeech(item.text, generation);
        }
      }
    } finally {
      if (processingGenerationRef.current === generation) {
        processingGenerationRef.current = null;
        if (queueRef.current.length === 0 || !enabledRef.current) setSpeaking(false);
      }
    }
  }, [playBrowserSpeech, playNeuralSpeech]);

  const enqueue = useCallback((rawText: string) => {
    const text = normalizeSpeechText(rawText);
    if (!enabledRef.current || !text) return;

    if (neuralAvailable) {
      const controller = new AbortController();
      const audio = createSpeech(text, controller.signal).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return null;
        return null;
      });
      queueRef.current.push({ text, controller, audio });
    } else {
      queueRef.current.push({ text, controller: null, audio: Promise.resolve(null) });
    }

    void drainQueue();
  }, [drainQueue, neuralAvailable]);

  const speakNow = useCallback((rawText: string) => {
    const text = normalizeSpeechText(rawText);
    if (!enabledRef.current || !text) return;
    stop();
    enqueue(text);
  }, [enqueue, stop]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      enabledRef.current = next;
      if (!next) stop();
      return next;
    });
  }, [stop]);

  return { enabled, speaking, enqueue, speakNow, stop, toggle };
}
