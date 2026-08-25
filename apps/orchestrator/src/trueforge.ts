import { TrueForge, type TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { Response } from 'express';
import { env } from './config.js';
import { SessionEventState, type ClientEvent } from './client-events.js';

export const trueforge = new TrueForge({
  baseUrl: env.TRUEFORGE_BASE_URL,
  ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
  timeoutInSeconds: 600,
});

type SessionEntry = { state: SessionEventState; lastUsedAt: number };

const MAX_SESSION_STATES = 100;
const SESSION_STATE_TTL_MS = 30 * 60 * 1000;
const sessionStates = new Map<string, SessionEntry>();
const activeSessionStreams = new Set<string>();

export class SessionBusyError extends Error {
  constructor() {
    super('A turn is already running for this session');
    this.name = 'SessionBusyError';
  }
}

function pruneSessionStates(now = Date.now()): void {
  for (const [sessionId, entry] of sessionStates) {
    if (!activeSessionStreams.has(sessionId) && now - entry.lastUsedAt > SESSION_STATE_TTL_MS) {
      sessionStates.delete(sessionId);
    }
  }

  if (sessionStates.size < MAX_SESSION_STATES) return;
  const candidates = [...sessionStates.entries()]
    .filter(([sessionId]) => !activeSessionStreams.has(sessionId))
    .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt);
  for (const [sessionId] of candidates) {
    if (sessionStates.size < MAX_SESSION_STATES) break;
    sessionStates.delete(sessionId);
  }
}

function send(response: Response, event: ClientEvent): void {
  response.write(`${JSON.stringify(event)}\n`);
}

function configureStream(response: Response): void {
  response.status(200);
  response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('cache-control', 'no-cache, no-transform');
  response.setHeader('x-accel-buffering', 'no');
  response.flushHeaders();
}

async function pipeStream(
  sessionId: string,
  response: Response,
  input: TrueForgeApi.TurnInputItem[],
): Promise<void> {
  if (activeSessionStreams.has(sessionId)) throw new SessionBusyError();
  activeSessionStreams.add(sessionId);
  pruneSessionStates();

  try {
    const stream = await trueforge.sessions.createTurnStream(sessionId, { input });
    const entry = sessionStates.get(sessionId) ?? {
      state: new SessionEventState(),
      lastUsedAt: Date.now(),
    };
    sessionStates.set(sessionId, entry);
    configureStream(response);
    for await (const { data: event } of stream.withMetadata()) {
      entry.lastUsedAt = Date.now();
      for (const clientEvent of entry.state.ingest(event)) send(response, clientEvent);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TrueForge error';
    if (!response.headersSent) throw error;
    send(response, { type: 'error', message });
  } finally {
    activeSessionStreams.delete(sessionId);
    if (response.headersSent) response.end();
  }
}

export async function createSession(): Promise<string> {
  const { data: session } = await trueforge.sessions.create({
    agent: { name: env.JARVIS_AGENT_NAME },
  });
  pruneSessionStates();
  sessionStates.set(session.id, { state: new SessionEventState(), lastUsedAt: Date.now() });
  return session.id;
}

export async function runCommand(sessionId: string, command: string, response: Response): Promise<void> {
  await pipeStream(sessionId, response, [{ type: 'user.message', content: command }]);
}

export type ApprovalDecision = {
  threadId: string;
  toolCallId: string;
  status: 'allow' | 'deny';
  reason?: string;
};

export async function resolveApprovals(
  sessionId: string,
  decisions: ApprovalDecision[],
  response: Response,
): Promise<void> {
  const input: TrueForgeApi.UserToolApprovalEvent[] = decisions.map((decision) => ({
    type: 'user.tool_approval',
    threadId: decision.threadId,
    toolCallId: decision.toolCallId,
    approval:
      decision.status === 'allow'
        ? { status: 'allow' }
        : { status: 'deny', reason: decision.reason ?? 'Denied by the user' },
  }));
  await pipeStream(sessionId, response, input);
}

export async function trueforgeHealth(): Promise<{ connected: boolean; version?: string }> {
  try {
    const response = await fetch(`${env.TRUEFORGE_BASE_URL.replace(/\/$/, '')}/healthz`, {
      ...(env.TRUEFORGE_TOKEN ? { headers: { authorization: `Bearer ${env.TRUEFORGE_TOKEN}` } } : {}),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return { connected: false };

    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const payload = (await response.json()) as { version?: unknown };
        if (typeof payload.version === 'string' && payload.version) {
          return { connected: true, version: payload.version };
        }
      } catch {
        // A successful health response still proves connectivity when its optional metadata is malformed.
      }
    }

    return { connected: true };
  } catch {
    return { connected: false };
  }
}
