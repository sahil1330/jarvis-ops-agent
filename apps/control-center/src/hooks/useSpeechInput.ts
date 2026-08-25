import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      return;
    }

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
    recognition.onerror = recognition.onend;
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening, onTranscript]);

  return { listening, supported, toggle };
}
