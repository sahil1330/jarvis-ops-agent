import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/api';

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function preferredMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

export function useSpeechInput(onTranscript: (text: string) => void, neuralAvailable = false) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const browserSupported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const neuralSupported = neuralAvailable && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const supported = neuralSupported || browserSupported;

  const cleanupMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recorderRef.current?.stop();
    abortRef.current?.abort();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startBrowserRecognition = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => onTranscript(event.results[0]?.[0]?.transcript ?? '');
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setError('Browser speech recognition failed. You can type the command instead.');
      recognition.onend?.();
    };
    recognitionRef.current = recognition;
    setError('');
    setListening(true);
    recognition.start();
  }, [onTranscript]);

  const startNeuralRecording = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('Microphone recording failed.');
        cleanupMedia();
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanupMedia();
        if (audio.size === 0) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setTranscribing(true);
        void transcribeAudio(audio, controller.signal)
          .then((text) => onTranscript(text))
          .catch((reason: unknown) => {
            if (reason instanceof DOMException && reason.name === 'AbortError') return;
            setError('Neural transcription failed. Browser speech or typing is still available.');
          })
          .finally(() => {
            if (abortRef.current === controller) abortRef.current = null;
            setTranscribing(false);
          });
      };
      setListening(true);
      recorder.start();
    } catch {
      cleanupMedia();
      if (browserSupported) startBrowserRecognition();
      else setError('Microphone access was not available.');
    }
  }, [browserSupported, cleanupMedia, onTranscript, startBrowserRecognition]);

  const toggle = useCallback(() => {
    if (recorderRef.current && listening) {
      recorderRef.current.stop();
      return;
    }
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      return;
    }
    if (transcribing) return;
    if (neuralSupported) void startNeuralRecording();
    else startBrowserRecognition();
  }, [listening, neuralSupported, startBrowserRecognition, startNeuralRecording, transcribing]);

  return {
    listening,
    transcribing,
    supported,
    error,
    mode: neuralSupported ? 'neural' as const : browserSupported ? 'browser' as const : 'none' as const,
    toggle,
  };
}
