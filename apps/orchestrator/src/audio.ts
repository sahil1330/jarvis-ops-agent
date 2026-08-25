import { env } from './config.js';
import { createUpstreamHttpError } from './http-errors.js';

const OPENAI_AUDIO_BASE_URL = 'https://api.openai.com/v1/audio';
const MAX_SPEECH_INPUT_CHARACTERS = 4_096;
const MAX_TRANSCRIPTION_BYTES = 12 * 1024 * 1024;

export class AudioServiceUnavailableError extends Error {
  constructor(message = 'Neural voice is not configured') {
    super(message);
    this.name = 'AudioServiceUnavailableError';
  }
}

function requireOpenAiKey(): string {
  if (!env.OPENAI_API_KEY) throw new AudioServiceUnavailableError();
  return env.OPENAI_API_KEY;
}

async function openAiAudioRequest(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${OPENAI_AUDIO_BASE_URL}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireOpenAiKey()}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw await createUpstreamHttpError(response, 'OpenAI audio request failed');
  }

  return response;
}

export function neuralAudioCapabilities(): { stt: boolean; tts: boolean } {
  const configured = Boolean(env.OPENAI_API_KEY);
  return { stt: configured, tts: configured };
}

export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
  if (audio.byteLength === 0) throw new Error('The audio recording is empty');
  if (audio.byteLength > MAX_TRANSCRIPTION_BYTES) throw new Error('The audio recording is too large');

  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  const form = new FormData();
  const bytes = Uint8Array.from(audio);
  form.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), `jarvis-input.${extension}`);
  form.append('model', env.OPENAI_STT_MODEL);
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append('prompt', 'Personal assistant command. Expect names, calendar terms, Gmail, scheduling, and technology vocabulary.');

  const response = await openAiAudioRequest('transcriptions', { method: 'POST', body: form });
  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new Error('Speech transcription returned no text');
  return text;
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const input = text.trim().slice(0, MAX_SPEECH_INPUT_CHARACTERS);
  if (!input) throw new Error('Speech text is empty');

  const response = await openAiAudioRequest('speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input,
      response_format: 'mp3',
      instructions:
        'Speak like a composed premium personal assistant: calm, precise, understated, warm, concise, and confident. Use a subtle British-leaning cadence. Do not imitate any real actor or copyrighted character performance.',
    }),
  });

  return Buffer.from(await response.arrayBuffer());
}
