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
export type GithubCommitShape = {
  sha?: unknown;
  parents?: Array<{ sha?: unknown }>;
  files?: Array<{ filename?: unknown; status?: unknown }>;
};

const timeoutMs = 8_000;
const EXPECTED_DEMO_BRANCH = 'demo/client-regression';
const DEMO_PRODUCT_PATH = 'demo-lab/src/product.js';
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

export function formatUrlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function encodeRefPath(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

export function resumeLimitMiB(source: string): number | null {
  const matches = [...source.matchAll(/^const MAX_RESUME_BYTES = (\d+) \* 1024 \* 1024;\s*$/gm)];
  if (matches.length !== 1) return null;
  const value = Number(matches[0]?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function regressionCommitProblem(commit: GithubCommitShape): string | null {
  if (!Array.isArray(commit.parents) || commit.parents.length !== 1 || typeof commit.parents[0]?.sha !== 'string') {
    return 'Controlled regression tip must have exactly one parent commit.';
  }
  if (!Array.isArray(commit.files) || commit.files.length !== 1) {
    return 'Controlled regression commit must change exactly one file.';
  }
  const file = commit.files[0];
  if (file?.filename !== DEMO_PRODUCT_PATH || file.status !== 'modified') {
    return `Controlled regression commit must only modify ${DEMO_PRODUCT_PATH}.`;
  }
  return null;
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
  const root = `http://${formatUrlHost(host)}:${port}`;
  const healthUrl = `${root}/healthz`;
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(healthUrl);
    if (!response.ok) return result('GitHub MCP · health', 'fail', `HTTP ${response.status} from ${healthUrl}.`, 'Start npm run dev:github.', start);
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

    // GET /mcp is intentionally rejected with 405 after bearer authentication. A stale/wrong
    // bearer is rejected earlier with 401, so this probes the actual credential boundary without
    // invoking a tool or creating any external side effect.
    const authProbe = await fetchWithTimeout(`${root}/mcp`, {
      headers: { authorization: `Bearer ${env.JARVIS_GITHUB_MCP_BEARER_TOKEN ?? ''}` },
    });
    if (authProbe.status === 401 || authProbe.status === 403) {
      return result('GitHub MCP · auth', 'fail', `Configured MCP bearer was rejected with HTTP ${authProbe.status}.`, 'Restart the GitHub MCP with the same JARVIS_GITHUB_MCP_BEARER_TOKEN used by TrueForge.', start);
    }
    if (authProbe.status !== 405) {
      return result('GitHub MCP · auth', 'fail', `Authenticated MCP probe returned unexpected HTTP ${authProbe.status}.`, 'Confirm the GitHub MCP /mcp route is the expected stateless endpoint.', start);
    }

    return result('GitHub MCP · health', 'pass', `GitHub operations MCP reachable and bearer accepted · ${String(payload.repository)} @ ${String(payload.baseBranch)}.`, undefined, start);
  } catch (reason) {
    return result('GitHub MCP · health', 'fail', redactError(reason), `Start npm run dev:github and confirm ${healthUrl} is reachable.`, start);
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

async function githubFileAtRevision(env: Env, repository: string, path: string, revision: string): Promise<string> {
  const response = await githubGet(env, `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(revision)}`);
  if (!response.ok) throw new Error(`GitHub fixture lookup returned HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const payload = await response.json() as GithubContent;
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') throw new Error('GitHub returned an unsupported demo fixture payload.');
  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function checkGoldenRegression(env: Env): Promise<DoctorResult> {
  const repository = env.JARVIS_GITHUB_REPOSITORY?.trim();
  const branch = env.JARVIS_GITHUB_BASE_BRANCH?.trim();
  if (!repository || !branch || !env.JARVIS_GITHUB_TOKEN) {
    return result('GitHub · golden regression', 'fail', 'GitHub repository, branch, or token is missing.', 'Configure the GitHub demo connector values in .env.');
  }

  const start = performance.now();
  try {
    const refResponse = await githubGet(env, `/repos/${repository}/git/ref/heads/${encodeRefPath(branch)}`);
    if (!refResponse.ok) {
      throw new Error(`GitHub branch lookup returned HTTP ${refResponse.status}: ${(await refResponse.text()).slice(0, 400)}`);
    }
    const ref = await refResponse.json() as GithubRef;
    const sha = typeof ref.object?.sha === 'string' ? ref.object.sha : '';
    if (!sha) throw new Error('GitHub branch lookup returned no commit SHA.');

    const commitResponse = await githubGet(env, `/repos/${repository}/commits/${sha}`);
    if (!commitResponse.ok) throw new Error(`GitHub commit lookup returned HTTP ${commitResponse.status}: ${(await commitResponse.text()).slice(0, 400)}`);
    const commit = await commitResponse.json() as GithubCommitShape;
    const invariantProblem = regressionCommitProblem(commit);
    if (invariantProblem) {
      return result('GitHub · golden regression', 'fail', invariantProblem, 'Reset demo/client-regression to a single commit that only lowers the demo upload ceiling.', start);
    }
    const parentSha = commit.parents?.[0]?.sha;
    if (typeof parentSha !== 'string') throw new Error('Controlled regression commit returned no parent SHA.');

    // Both versions are fetched by immutable SHAs so the success message and validated content
    // cannot diverge if the branch moves during the doctor run.
    const [regressionSource, healthySource] = await Promise.all([
      githubFileAtRevision(env, repository, DEMO_PRODUCT_PATH, sha),
      githubFileAtRevision(env, repository, DEMO_PRODUCT_PATH, parentSha),
    ]);
    const regressionLimit = resumeLimitMiB(regressionSource);
    const healthyLimit = resumeLimitMiB(healthySource);
    if (regressionLimit !== 1 || healthyLimit !== 6) {
      return result(
        'GitHub · golden regression',
        'fail',
        `Controlled regression limits are not the expected healthy 6 MiB → regression 1 MiB transition (found ${String(healthyLimit)} → ${String(regressionLimit)}).`,
        'Reset the controlled demo branch so its only change lowers MAX_RESUME_BYTES from 6 MiB to 1 MiB.',
        start,
      );
    }

    return result(
      'GitHub · golden regression',
      'pass',
      `${repository} · ${branch} @ ${sha.slice(0, 12)} · isolated 6 MiB → 1 MiB upload regression verified.`,
      undefined,
      start,
    );
  } catch (reason) {
    return result('GitHub · golden regression', 'fail', redactError(reason), 'Confirm the fine-grained token can read the allowlisted repository and the controlled demo branch exists.', start);
  }
}

export async function runGithubDoctor(env: Env = process.env): Promise<DoctorResult[]> {
  const checks = githubConfigChecks(env);
  if (checks.some((item) => item.status === 'fail')) return checks;
  const [mcp, regression] = await Promise.all([checkGithubMcp(env), checkGoldenRegression(env)]);
  return [...checks, mcp, regression];
}
