import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './config.js';
import {
  createSession,
  resolveApprovals,
  runCommand,
  SessionBusyError,
  trueforgeHealth,
} from './trueforge.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.CONTROL_CENTER_ORIGIN }));
app.use(express.json({ limit: '64kb' }));

const commandSchema = z.object({ command: z.string().trim().min(2).max(4_000) });
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

app.get('/api/health', async (_request, response) => {
  const harness = await trueforgeHealth();
  response.json({
    status: 'ok',
    harness,
    agent: env.JARVIS_AGENT_NAME,
    mode: env.JARVIS_DEMO_MODE ? 'demo' : 'live',
  });
});

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

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error instanceof z.ZodError ? 400 : error instanceof SessionBusyError ? 409 : 500;
  const message = error instanceof z.ZodError ? 'Invalid request payload' : error instanceof Error ? error.message : 'Unexpected server error';
  if (status >= 500) console.error(error);
  if (!response.headersSent) response.status(status).json({ error: message });
});

app.listen(env.ORCHESTRATOR_PORT, () => {
  console.log(`Jarvis orchestrator listening on http://localhost:${env.ORCHESTRATOR_PORT}`);
});
