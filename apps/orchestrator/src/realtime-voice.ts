import { AudioServiceUnavailableError } from './audio.js';
import { env } from './config.js';
import { createUpstreamHttpError } from './http-errors.js';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const MAX_SDP_CHARACTERS = 64_000;

function requireOpenAiKey(): string {
  if (!env.OPENAI_API_KEY) throw new AudioServiceUnavailableError('Realtime voice is not configured');
  return env.OPENAI_API_KEY;
}

export function realtimeVoiceAvailable(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function createRealtimeMultipartBody(sdp: string, session: object): FormData {
  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify(session));
  return form;
}

export async function createRealtimeVoiceCall(offerSdp: string): Promise<string> {
  // Preserve the browser-generated offer, including its terminating CRLF.
  const sdp = offerSdp;
  if (!sdp.trim() || sdp.length > MAX_SDP_CHARACTERS) throw new Error('Invalid WebRTC session description');

  const session = {
    type: 'realtime',
    model: env.OPENAI_REALTIME_MODEL,
    output_modalities: ['audio'],
    audio: {
      output: {
        voice: env.OPENAI_REALTIME_VOICE,
      },
    },
    instructions:
      'You are the realtime voice renderer for Jarvis. Never invent, answer, summarize, or add content. For each response request, say only the exact supplied text. Speak like a natural human personal assistant: relaxed, warm, conversational, confident, and fluid. Use ordinary pacing, natural emphasis, contractions, and subtle emotion. Avoid announcer delivery, exaggerated formality, robotic cadence, dramatic pauses, or over-enunciation.',
  };

  const multipart = createRealtimeMultipartBody(sdp, session);

  const response = await fetch(REALTIME_CALLS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requireOpenAiKey()}`,
    },
    // fetch supplies the multipart boundary required by the encoded FormData.
    body: multipart,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw await createUpstreamHttpError(response, 'Realtime voice session failed');
  }

  const answerSdp = await response.text();
  if (!answerSdp.trim().startsWith('v=0')) {
    throw new Error('Realtime voice session returned an invalid SDP answer');
  }
  return answerSdp;
}
