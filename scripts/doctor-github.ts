import type { DoctorResult, DoctorStatus } from './doctor-core.js';
import { redactError } from './doctor-core.js';

type Env = NodeJS.ProcessEnv;

type GithubHealth = {
  status?: unknown;
  service?: unknown;
  repository?: unknown;
  baseBranch?: unknown;
};

type GithubRef = { object?: { sha?: unknown } };
type GithubContent = { content?: unknown; encoding?: unknown; sha?: unknown };

const timeoutMs = 8_000;
const EXPECTED_DEMO_BRANCH = 'demo/client-regression';
const EXPECTED_REGRESSION = 'const MAX_RESUME_BYTES = 1 * 1024 * 1024;';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

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

export function githubConfigChecks(env: Env): DoctorResult[] {
  const checks: DoctorResult[] = [];
  const required = [
    'JARVIS_GITHUB_MCP_BEARER_TOKEN',
    'JARVIS_GITHUB_TOKEN',
    'JARVIS_GITHUB_REPOSITORY',
    'JARVIS_GITHUB_BASE_BRANCH',
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

  const bearer = env.JARVIS_GITHUB_MCP_BEARER_TOKEN?.trim() ?? '';
  if (bearer) {
    checks.push(result(
      'Config · GitHub MCP bearer strength',
      bearer.length >= 32 ? 'pass' : 'fail',
      bearer.length >= 32 ? 'Bearer token length is acceptable.' : 'JARVIS_GITHUB_MCP_BEARER_TOKEN is shorter than 32 characters.',
      bearer.length >= 32 ? undefined : 'Generate a dedicated token with: openssl rand -hex 32',
    ));
  }

  const host = env.GITHUB_MCP_HOST?.trim() || '127.0.0.1';
  checks.push(result(
    'Config · GitHub MCP exposure',
    LOOPBACK_HOSTS.has(host) ? 'pass' : 'fail',
    LOOPBACK_HOSTS.has(host)
      ? `GitHub MCP is bound to loopback (${host}).`
      : `GITHUB_MCP_HOST=${host} exposes the write-capable demo connector beyond loopback.`,
    LOOPBACK_HOSTS.has(host) ? undefined : 'Use GITHUB_MCP_HOST=127.0.0.1 for the hackathon demo.',
  ));

  const branch = env.JARVIS_GITHUB_BASE_BRANCH?.trim();
  if (branch) {
    checks.push(result(
      'Config · Golden regression branch',
      branch === EXPECTED_DEMO_BRANCH ? 'pass' : 'fail',
      branch === EXPECTED_DEMO_BRANCH
        ? `GitHub connector targets ${EXPECTED_DEMO_BRANCH}.`
        : `GitHub connector targets ${branch}; the golden mission requires ${EXPECTED_DEMO_BRANCH}.`,
      branch === EXPECTED_DEMO_BRANCH ? undefined : `Set JARVIS_GITHUB_BASE_BRANCH=${EXPECTED_DEMO_BRANCH}.`,
    ));
  }

  return checks;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function checkGithubMcp(env: Env): Promise<DoctorResult> {
  const host = env.GITHUB_MCP_HOST?.trim() || '127.0.0.1';
  const port = env.GITHUB_MCP_PORT?.trim() || '8789';
  const url = `http://${host}:${port}/healthz`;
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return result('GitHub MCP · health', 'fail', `HTTP ${response.status} from ${url}.`, 'Start npm run dev:github-mcp.', start);
    const payload = await response.json() as GithubHealth;
    const repository = env.JARVIS_GITHUB_REPOSITORY?.trim();
    const branch = env.JARVIS_GITHUB_BASE_BRANCH?.trim();
    if (payload.service !== 'jarvis-github-ops-mcp') {
      return result('GitHub MCP · health', 'fail', 'Unexpected service responded on the GitHub MCP health port.', 'Check GITHUB_MCP_HOST/GITHUB_MCP_PORT.', start);
    }
    if (repository && payload.repository !== repository) {
      return result('GitHub MCP · health', 'fail', `MCP repository does not match JARVIS_GITHUB_REPOSITORY (${repository}).`, 'Restart the GitHub MCP after fixing .env.', start);
    }
    if (branch && payload.baseBranch !== branch) {
      return result('GitHub MCP · health', 'fail', `MCP base branch does not match JARVIS_GITHUB_BASE_BRANCH (${branch}).`, 'Restart the GitHub MCP after fixing .env.', start);
    }
    return result('GitHub MCP · health', 'pass', `GitHub operations MCP reachable · ${String(payload.repository)} @ ${String(payload.baseBranch)}.`, undefined, start);
  } catch (reason) {
    return result('GitHub MCP · health', 'fail', redactError(reason), `Start npm run dev:github-mcp and confirm ${url} is reachable.`, start);
  }
}

async function githubGet(env: Env, path: string): Promise<Response> {
  return fetchWithTimeout(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.JARVIS_GITHUB_TOKEN ?? ''}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'jarvis-ops-agent-doctor',
    },
  });
}

async function checkGoldenRegression(env: Env): Promise<DoctorResult> {
  const repository = env.JARVIS_GITHUB_REPOSITORY?.trim();
  const branch = env.JARVIS_GITHUB_BASE_BRANCH?.trim();
  if (!repository || !branch || !env.JARVIS_GITHUB_TOKEN) {
    return result('GitHub · golden regression', 'fail', 'GitHub repository, branch, or token is missing.', 'Configure the GitHub demo connector values in .env.');
  }

  const start = performance.now();
  try {
    const refResponse = await githubGet(env, `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (!refResponse.ok) {
      throw new Error(`GitHub branch lookup returned HTTP ${refResponse.status}: ${(await refResponse.text()).slice(0, 400)}`);
    }
    const ref = await refResponse.json() as GithubRef;
    const sha = typeof ref.object?.sha === 'string' ? ref.object.sha : '';
    if (!sha) throw new Error('GitHub branch lookup returned no commit SHA.');

    const contentResponse = await githubGet(env, `/repos/${repository}/contents/demo-lab/src/product.js?ref=${encodeURIComponent(branch)}`);
    if (!contentResponse.ok) {
      throw new Error(`GitHub demo fixture lookup returned HTTP ${contentResponse.status}: ${(await contentResponse.text()).slice(0, 400)}`);
    }
    const payload = await contentResponse.json() as GithubContent;
    if (payload.encoding !== 'base64' || typeof payload.content !== 'string') throw new Error('GitHub returned an unsupported demo fixture payload.');
    const source = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
    if (!source.includes(EXPECTED_REGRESSION)) {
      return result(
        'GitHub · golden regression',
        'fail',
        `${branch} exists but does not contain the expected 1 MiB client regression.`,
        'Reset the controlled demo branch so only MAX_RESUME_BYTES is lowered from 6 MiB to 1 MiB.',
        start,
      );
    }

    return result(
      'GitHub · golden regression',
      'pass',
      `${repository} · ${branch} @ ${sha.slice(0, 12)} · expected 1 MiB upload regression present.`,
      undefined,
      start,
    );
  } catch (reason) {
    return result('GitHub · golden regression', 'fail', redactError(reason), 'Confirm the fine-grained token can read the allowlisted repository and the controlled demo branch exists.', start);
  }
}

export async function runGithubDoctor(env: Env = process.env): Promise<DoctorResult[]> {
  const checks = githubConfigChecks(env);
  const missingRequired = checks.some((item) => item.status === 'fail' && item.name.startsWith('Config · JARVIS_GITHUB_'));
  if (missingRequired) return checks;
  const [mcp, regression] = await Promise.all([checkGithubMcp(env), checkGoldenRegression(env)]);
  return [...checks, mcp, regression];
}
