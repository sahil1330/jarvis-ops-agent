import type { Health, StreamEvent } from '../types';

type ApprovalDecision = {
  threadId: string;
  toolCallId: string;
  status: 'allow' | 'deny';
  reason?: string;
};

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function consumeNdjson(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!response.ok) throw new Error(await parseError(response));
  if (!response.body) throw new Error('The server returned an empty stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
    if (done) break;
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as Health;
}

export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/audio/transcriptions', {
    method: 'POST',
    headers: { 'content-type': audio.type || 'audio/webm' },
    body: audio,
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  const payload = (await response.json()) as { text: string };
  return payload.text;
}

export async function createSpeech(text: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch('/api/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.blob();
}

export async function exchangeRealtimeVoiceSdp(sdp: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/audio/realtime/session', {
    method: 'POST',
    headers: { 'content-type': 'application/sdp' },
    body: sdp,
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.text();
}

export async function createSession(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/sessions', { method: 'POST', signal });
  if (!response.ok) throw new Error(await parseError(response));
  const payload = (await response.json()) as { sessionId: string };
  return payload.sessionId;
}

export async function runTurn(
  sessionId: string,
  command: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command }),
    signal,
  });
  await consumeNdjson(response, onEvent);
}

export async function resolveApproval(
  sessionId: string,
  decisions: ApprovalDecision[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/approvals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decisions }),
    signal,
  });
  await consumeNdjson(response, onEvent);
}
