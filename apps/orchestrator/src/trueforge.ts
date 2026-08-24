import { TrueForge, type TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { Response } from 'express';
import { env } from './config.js';
import { SessionEventState, type ClientEvent } from './client-events.js';

export const trueforge = new TrueForge({
  baseUrl: env.TRUEFORGE_BASE_URL,
  ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
  timeoutInSeconds: 600,
});

const sessionStates = new Map<string, SessionEventState>();

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
  configureStream(response);
  const state = sessionStates.get(sessionId) ?? new SessionEventState();
  sessionStates.set(sessionId, state);

  try {
    const stream = await trueforge.sessions.createTurnStream(sessionId, { input });
    for await (const { data: event } of stream.withMetadata()) {
      for (const clientEvent of state.ingest(event)) send(response, clientEvent);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TrueForge error';
    send(response, { type: 'error', message });
  } finally {
    response.end();
  }
}

export async function createSession(): Promise<string> {
  const { data: session } = await trueforge.sessions.create({
    agent: { name: env.JARVIS_AGENT_NAME },
  });
  sessionStates.set(session.id, new SessionEventState());
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
    const payload = (await response.json()) as { version?: string };
    return { connected: true, ...(payload.version ? { version: payload.version } : {}) };
  } catch {
    return { connected: false };
  }
}
