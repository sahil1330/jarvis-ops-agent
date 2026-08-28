import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { AudioServiceUnavailableError, neuralAudioCapabilities, synthesizeSpeech, transcribeAudio } from './audio.js';
import { env } from './config.js';
import { UpstreamHttpError } from './http-errors.js';
import { createRealtimeVoiceCall, realtimeVoiceAvailable } from './realtime-voice.js';
import {
  createSession,
  resolveApprovals,
  resolveToolResponses,
  runCommand,
  SessionBusyError,
  trueforgeHealth,
} from './trueforge.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.CONTROL_CENTER_ORIGIN }));
app.use(express.json({ limit: '64kb' }));

const commandSchema = z.object({ command: z.string().trim().min(2).max(4_000) });
const speechSchema = z.object({ text: z.string().trim().min(1).max(4_096) });
const approvalSchema = z.object({
  decisions: z
    .array(
      z.object({
        threadId: z.string().min(1),
        toolCallId: z.string().min(1),
        status: z.enum(['allow', 'deny']),
        reason: z.string().max(500).optional(),
      }),
    )
    .min(1),
});
const toolResponseSchema = z.object({
  responses: z
    .array(
      z.object({
        threadId: z.string().min(1),
        toolCallId: z.string().min(1),
        content: z.string().trim().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(20),
});

app.get('/api/health', async (_request, response) => {
  const harness = await trueforgeHealth();
  response.json({
    status: 'ok',
    harness,
    agent: env.JARVIS_AGENT_NAME,
    mode: env.JARVIS_DEMO_MODE ? 'demo' : 'live',
    audio: { ...neuralAudioCapabilities(), realtime: realtimeVoiceAvailable() },
  });
});

app.post(
  '/api/audio/transcriptions',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '12mb' }),
  async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body)) throw new z.ZodError([]);
      const text = await transcribeAudio(request.body, request.headers['content-type'] ?? 'audio/webm');
      response.json({ text });
    } catch (error) {
      next(error);
    }
  },
);

app.post('/api/audio/speech', async (request, response, next) => {
  try {
    const { text } = speechSchema.parse(request.body);
    const audio = await synthesizeSpeech(text);
    response.setHeader('content-type', 'audio/mpeg');
    response.setHeader('cache-control', 'no-store');
    response.send(audio);
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/audio/realtime/session',
  express.text({ type: 'application/sdp', limit: '64kb' }),
  async (request, response, next) => {
    try {
      if (typeof request.body !== 'string' || !request.body.trim()) throw new z.ZodError([]);
      const answerSdp = await createRealtimeVoiceCall(request.body);
      response.setHeader('content-type', 'application/sdp');
      response.setHeader('cache-control', 'no-store');
      response.send(answerSdp);
    } catch (error) {
      next(error);
    }
  },
);

app.post('/api/sessions', async (_request, response, next) => {
  try {
    response.status(201).json({ sessionId: await createSession() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/turns', async (request, response, next) => {
  try {
    const { command } = commandSchema.parse(request.body);
    await runCommand(request.params.sessionId, command, response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/approvals', async (request, response, next) => {
  try {
    const { decisions } = approvalSchema.parse(request.body);
    await resolveApprovals(
      request.params.sessionId,
      decisions.map((decision) => ({
        threadId: decision.threadId,
        toolCallId: decision.toolCallId,
        status: decision.status,
        ...(decision.reason ? { reason: decision.reason } : {}),
      })),
      response,
    );
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/tool-responses', async (request, response, next) => {
  try {
    const { responses } = toolResponseSchema.parse(request.body);
    await resolveToolResponses(request.params.sessionId, responses, response);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status =
    error instanceof z.ZodError
      ? 400
      : error instanceof SessionBusyError
        ? 409
        : error instanceof AudioServiceUnavailableError
          ? 503
          : error instanceof UpstreamHttpError
            ? error.status >= 400 && error.status < 500
              ? error.status
              : 502
            : 500;
  const message = error instanceof z.ZodError ? 'Invalid request payload' : error instanceof Error ? error.message : 'Unexpected server error';
  if (error instanceof UpstreamHttpError) {
    console.error('[orchestrator] Upstream request failed', {
      method: request.method,
      path: request.path,
      upstreamStatus: error.status,
      message: error.message,
    });
  } else if (status >= 500 && !(error instanceof AudioServiceUnavailableError)) {
    console.error(error);
  }
  if (!response.headersSent) response.status(status).json({ error: message });
});

const server = app.listen(env.ORCHESTRATOR_PORT, env.ORCHESTRATOR_HOST, () => {
  console.log(`Jarvis orchestrator listening on http://${env.ORCHESTRATOR_HOST}:${env.ORCHESTRATOR_PORT}`);
});

server.on('error', (error) => {
  console.error('Jarvis orchestrator failed to listen', error);
  process.exit(1);
});
