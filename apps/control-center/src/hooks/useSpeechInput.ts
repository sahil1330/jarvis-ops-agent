import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/api';
import { calculateRms, createVoiceActivityState, updateVoiceActivity } from '../lib/voice-activity';

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

const MAX_RECORDING_MS = 45_000;

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);

  const browserSupported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const neuralSupported = neuralAvailable && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const supported = neuralSupported || browserSupported;

  const cleanupVad = useCallback(() => {
    if (vadFrameRef.current !== null) {
      window.cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    if (maxRecordingTimerRef.current !== null) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
    mediaSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    mediaSourceRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  const cleanupMedia = useCallback(() => {
    cleanupVad();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setListening(false);
  }, [cleanupVad]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    abortRef.current?.abort();
    cleanupVad();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [cleanupVad]);

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

  const startVoiceEndpointing = useCallback(async (stream: MediaStream, recorder: MediaRecorder) => {
    if (typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    audioContextRef.current = context;
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.12;
    source.connect(analyser);
    mediaSourceRef.current = source;
    analyserRef.current = analyser;

    const samples = new Float32Array(analyser.fftSize);
    let vadState = createVoiceActivityState();
    const sample = (now: number) => {
      if (recorderRef.current !== recorder || recorder.state !== 'recording') return;
      analyser.getFloatTimeDomainData(samples);
      const next = updateVoiceActivity(vadState, calculateRms(samples), now);
      vadState = next.state;
      if (next.shouldStop) {
        recorder.stop();
        return;
      }
      vadFrameRef.current = window.requestAnimationFrame(sample);
    };
    vadFrameRef.current = window.requestAnimationFrame(sample);

    maxRecordingTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, MAX_RECORDING_MS);
  }, []);

  const startNeuralRecording = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
      recorder.start(250);
      void startVoiceEndpointing(stream, recorder).catch(() => {
        // Recording still works with manual stop if Web Audio endpointing is unavailable.
      });
    } catch {
      cleanupMedia();
      if (browserSupported) startBrowserRecognition();
      else setError('Microphone access was not available.');
    }
  }, [browserSupported, cleanupMedia, onTranscript, startBrowserRecognition, startVoiceEndpointing]);

  const toggle = useCallback(() => {
    if (recorderRef.current && listening) {
      if (recorderRef.current.state === 'recording') recorderRef.current.stop();
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
    autoStopsOnSilence: neuralSupported && typeof AudioContext !== 'undefined',
    toggle,
  };
}
