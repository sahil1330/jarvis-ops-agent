import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

export type DoctorStatus = 'pass' | 'warn' | 'fail';
export type DoctorResult = {
  name: string;
  status: DoctorStatus;
  detail: string;
  fix?: string;
  durationMs?: number;
};

type Env = NodeJS.ProcessEnv;

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const timeoutMs = 8_000;

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

function result(name: string, status: DoctorStatus, detail: string, fix?: string, start?: number): DoctorResult {
  return {
    name,
    status,
    detail,
    ...(fix ? { fix } : {}),
    ...(start !== undefined ? { durationMs: elapsed(start) } : {}),
  };
}

export function redactError(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/((?:access|refresh)[_-]?token|client[_-]?secret|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1$2[redacted]')
    .slice(0, 700);
}

export function memoryPathForDoctor(rawPath: string | undefined): string {
  const value = rawPath || '../../.jarvis/memory.json';
  if (isAbsolute(value)) return value;
  // The MCP workspace resolves this value from apps/google-workspace-mcp.
  return resolve(repoRoot, 'apps/google-workspace-mcp', value);
}

export function configChecks(env: Env, allowDemo = false): DoctorResult[] {
  const checks: DoctorResult[] = [];
  const required = [
    'JARVIS_MCP_BEARER_TOKEN',
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
  ] as const;

  for (const name of required) {
    const configured = Boolean(env[name]?.trim());
    checks.push(result(
      `Config · ${name}`,
      configured ? 'pass' : 'fail',
      configured ? 'Configured' : 'Missing',
      configured ? undefined : `Set ${name} in the root .env file.`,
    ));
  }

  const token = env.JARVIS_MCP_BEARER_TOKEN ?? '';
  if (token && token.length < 32) {
    checks.push(result(
      'Config · MCP bearer strength',
      'fail',
      'JARVIS_MCP_BEARER_TOKEN is shorter than 32 characters.',
      'Generate a new token with: openssl rand -hex 32',
    ));
  } else if (token) {
    checks.push(result('Config · MCP bearer strength', 'pass', 'Bearer token length is acceptable.'));
  }

  const mailbox = env.GOOGLE_USER_EMAIL?.trim() || 'me';
  checks.push(result(
    'Config · Gmail mailbox identity',
    mailbox === 'me' ? 'pass' : 'fail',
    mailbox === 'me'
      ? 'Using the authenticated OAuth mailbox via users/me.'
      : `GOOGLE_USER_EMAIL is set to a literal mailbox (${mailbox}).`,
    mailbox === 'me'
      ? undefined
      : 'For personal OAuth, set GOOGLE_USER_EMAIL=me. Literal mailboxes can trigger Delegation denied errors.',
  ));

  const demoMode = env.JARVIS_DEMO_MODE === 'true';
  checks.push(result(
    'Config · Live demo mode',
    !demoMode || allowDemo ? (demoMode ? 'warn' : 'pass') : 'fail',
    demoMode ? 'JARVIS_DEMO_MODE=true' : 'JARVIS_DEMO_MODE=false',
    demoMode && !allowDemo ? 'Set JARVIS_DEMO_MODE=false for the judged live integration demo.' : undefined,
  ));

  return checks;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeout = timeoutMs): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
}

async function checkTrueForge(env: Env): Promise<DoctorResult[]> {
  const baseUrl = (env.TRUEFORGE_BASE_URL || 'http://localhost:8790').replace(/\/$/, '');
  const headers = env.TRUEFORGE_TOKEN ? { authorization: `Bearer ${env.TRUEFORGE_TOKEN}` } : undefined;
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(`${baseUrl}/healthz`, { headers });
    if (!response.ok) {
      return [result('TrueForge · health', 'fail', `Health endpoint returned HTTP ${response.status}.`, 'Start/fix TrueForge before the demo.', start)];
    }
  } catch (reason) {
    return [result('TrueForge · health', 'fail', redactError(reason), `Confirm TrueForge is running at ${baseUrl}.`, start)];
  }

  const results = [result('TrueForge · health', 'pass', `Reachable at ${baseUrl}.`, undefined, start)];
  const agentName = env.JARVIS_AGENT_NAME || 'jarvis-personal-ops';
  const agentStart = performance.now();
  try {
    const client = new TrueForge({
      baseUrl,
      ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
      timeoutInSeconds: 10,
    });
    const listed = await client.agents.list();
    const found = listed.data.some((agent) => agent.name === agentName);
    results.push(result(
      'TrueForge · Jarvis agent',
      found ? 'pass' : 'fail',
      found ? `${agentName} is registered.` : `${agentName} is not registered.`,
      found ? undefined : 'Run npm run setup:trueforge.',
      agentStart,
    ));
  } catch (reason) {
    results.push(result('TrueForge · Jarvis agent', 'fail', redactError(reason), 'Run npm run setup:trueforge after TrueForge is healthy.', agentStart));
  }
  return results;
}

async function checkMcp(env: Env): Promise<DoctorResult> {
  const host = env.MCP_HOST || '127.0.0.1';
  const port = env.MCP_PORT || '8788';
  const url = `http://${host}:${port}/healthz`;
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return result('MCP · health', 'fail', `HTTP ${response.status} from ${url}.`, 'Start/fix npm run dev:mcp.', start);
    const payload = await response.json().catch(() => null) as { mode?: string; memory?: string } | null;
    return result(
      'MCP · health',
      'pass',
      `Google Workspace MCP reachable${payload?.memory ? ` · memory ${payload.memory}` : ''}${payload?.mode ? ` · ${payload.mode}` : ''}.`,
      undefined,
      start,
    );
  } catch (reason) {
    return result('MCP · health', 'fail', redactError(reason), `Start npm run dev:mcp and confirm ${url} is reachable.`, start);
  }
}

async function refreshGoogleAccessToken(env: Env): Promise<string> {
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google OAuth refresh failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || !payload.access_token) throw new Error('Google OAuth returned no access token.');
  return payload.access_token;
}

async function googleGet(url: string, accessToken: string): Promise<Response> {
  return fetchWithTimeout(url, { headers: { authorization: `Bearer ${accessToken}` } });
}

async function checkGoogle(env: Env): Promise<DoctorResult[]> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) return [];
  const results: DoctorResult[] = [];
  const oauthStart = performance.now();
  let token: string;
  try {
    token = await refreshGoogleAccessToken(env);
    results.push(result('Google · OAuth refresh', 'pass', 'Refresh token exchanged successfully.', undefined, oauthStart));
  } catch (reason) {
    results.push(result('Google · OAuth refresh', 'fail', redactError(reason), 'Regenerate GOOGLE_REFRESH_TOKEN using the intended Google account and required scopes.', oauthStart));
    return results;
  }

  const gmailStart = performance.now();
  try {
    const response = await googleGet('https://gmail.googleapis.com/gmail/v1/users/me/profile', token);
    if (!response.ok) throw new Error(`Gmail API returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const profile = await response.json() as { emailAddress?: string };
    results.push(result('Google · Gmail read', 'pass', `Authenticated mailbox: ${profile.emailAddress || 'available'}.`, undefined, gmailStart));
  } catch (reason) {
    results.push(result('Google · Gmail read', 'fail', redactError(reason), 'Enable Gmail API and regenerate OAuth consent with gmail.readonly + gmail.send scopes.', gmailStart));
  }

  const calendarStart = performance.now();
  try {
    const params = new URLSearchParams({
      maxResults: '1',
      singleEvents: 'true',
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const response = await googleGet(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token);
    if (!response.ok) throw new Error(`Calendar API returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    results.push(result('Google · Calendar read', 'pass', 'Primary calendar is readable.', undefined, calendarStart));
  } catch (reason) {
    results.push(result('Google · Calendar read', 'fail', redactError(reason), 'Enable Google Calendar API and regenerate OAuth consent with calendar.events scope.', calendarStart));
  }
  return results;
}

async function checkOpenAiModel(apiKey: string, model: string, label: string): Promise<DoctorResult> {
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      return result(label, 'fail', `Model check returned HTTP ${response.status}: ${redactError(detail)}`, `Confirm the API key can access ${model}.`, start);
    }
    return result(label, 'pass', `${model} is accessible.`, undefined, start);
  } catch (reason) {
    return result(label, 'fail', redactError(reason), 'Check OPENAI_API_KEY, network access, and the configured model name.', start);
  }
}

async function checkOpenAi(env: Env): Promise<DoctorResult[]> {
  const key = env.OPENAI_API_KEY;
  if (!key) return [];
  const realtime = env.OPENAI_REALTIME_MODEL || 'gpt-realtime-1.5';
  const stt = env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
  return Promise.all([
    checkOpenAiModel(key, realtime, 'OpenAI · Realtime voice'),
    checkOpenAiModel(key, stt, 'OpenAI · STT'),
  ]);
}

async function nearestExisting(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      await stat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

async function checkMemory(env: Env): Promise<DoctorResult> {
  const path = memoryPathForDoctor(env.JARVIS_MEMORY_PATH);
  const start = performance.now();
  try {
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as { memories?: unknown };
      if (!Array.isArray(parsed.memories)) throw new Error('Memory file does not contain a memories array.');
      await access(path, constants.R_OK | constants.W_OK);
      return result('Memory · persistence', 'pass', `Memory store is readable/writable · ${parsed.memories.length} record(s).`, undefined, start);
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason;
      const ancestor = await nearestExisting(dirname(path));
      await access(ancestor, constants.W_OK);
      return result('Memory · persistence', 'pass', `Memory file does not exist yet; writable storage is available at ${ancestor}.`, undefined, start);
    }
  } catch (reason) {
    return result('Memory · persistence', 'fail', redactError(reason), `Fix permissions/path for JARVIS_MEMORY_PATH (${path}).`, start);
  }
}

function printResults(results: DoctorResult[]): void {
  const symbol: Record<DoctorStatus, string> = { pass: '✓', warn: '!', fail: '✗' };
  console.log('\nJARVIS READINESS\n');
  for (const item of results) {
    const timing = item.durationMs !== undefined ? ` · ${item.durationMs}ms` : '';
    console.log(`${symbol[item.status]} ${item.name}${timing}`);
    console.log(`  ${item.detail}`);
    if (item.fix) console.log(`  Fix: ${item.fix}`);
  }
  const failed = results.filter((item) => item.status === 'fail').length;
  const warnings = results.filter((item) => item.status === 'warn').length;
  console.log('');
  if (failed === 0) {
    console.log(warnings ? `READY WITH ${warnings} WARNING${warnings === 1 ? '' : 'S'}` : 'READY FOR LIVE DEMO');
  } else {
    console.log(`NOT READY · ${failed} BLOCKER${failed === 1 ? '' : 'S'}${warnings ? ` · ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}`);
  }
}

export async function runDoctor(env: Env = process.env, allowDemo = false): Promise<DoctorResult[]> {
  const results: DoctorResult[] = [...configChecks(env, allowDemo)];
  const [trueForge, mcp, google, openAi, memory] = await Promise.all([
    checkTrueForge(env),
    checkMcp(env),
    checkGoogle(env),
    checkOpenAi(env),
    checkMemory(env),
  ]);
  results.push(...trueForge, mcp, ...google, ...openAi, memory);
  return results;
}

async function main(): Promise<void> {
  const allowDemo = process.argv.includes('--allow-demo');
  const results = await runDoctor(process.env, allowDemo);
  printResults(results);
  if (results.some((item) => item.status === 'fail')) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (invokedDirectly) {
  void main().catch((reason) => {
    console.error(`Doctor failed unexpectedly: ${redactError(reason)}`);
    process.exitCode = 1;
  });
}
