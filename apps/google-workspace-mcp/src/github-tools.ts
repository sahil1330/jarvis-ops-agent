import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { githubEnv } from './github-config.js';

const API = 'https://api.github.com';
const MAX_ERROR_CHARS = 800;
const ALLOWED_PREFIX = 'demo-lab/';

type RefResponse = { object: { sha: string } };
type CommitResponse = { sha: string; commit: { message: string; tree: { sha: string } } };
type BlobResponse = { sha: string };
type TreeResponse = { sha: string };
type GitCommitResponse = { sha: string };
type PullResponse = { number: number; html_url: string };

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubEnv.JARVIS_GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'jarvis-ops-agent',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, MAX_ERROR_CHARS);
    throw new Error(`GitHub API ${response.status}: ${body || response.statusText}`);
  }
  return (await response.json()) as T;
}

function repoPath(): string {
  return `/repos/${githubEnv.JARVIS_GITHUB_REPOSITORY}`;
}

function assertSafePath(path: string): void {
  if (!path.startsWith(ALLOWED_PREFIX) || path.includes('..') || path.startsWith(`${ALLOWED_PREFIX}.github/`)) {
    throw new Error(`Only files under ${ALLOWED_PREFIX} may be published by the hackathon demo tool`);
  }
}

export function registerGithubOpsTools(server: McpServer): void {
  server.registerTool(
    'get_repository_snapshot',
    {
      title: 'Inspect demo repository',
      description: 'Read the allowlisted demo repository base revision before sandbox verification.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      const ref = await githubRequest<RefResponse>(
        `${repoPath()}/git/ref/heads/${encodeURIComponent(githubEnv.JARVIS_GITHUB_BASE_BRANCH)}`,
      );
      const commit = await githubRequest<CommitResponse>(`${repoPath()}/commits/${ref.object.sha}`);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        baseBranch: githubEnv.JARVIS_GITHUB_BASE_BRANCH,
        baseSha: commit.sha,
        message: commit.commit.message,
        allowedWritePrefix: ALLOWED_PREFIX,
      });
    },
  );

  server.registerTool(
    'publish_verified_fix',
    {
      title: 'Publish verified demo fix',
      description: 'Create a branch, commit bounded demo-lab file changes, and open a pull request only when the supplied base SHA is still current. This external side effect must be approval-gated by TrueForge.',
      inputSchema: {
        baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
        branchName: z.string().regex(/^jarvis\/[a-z0-9][a-z0-9._/-]{2,80}$/),
        files: z.array(z.object({
          path: z.string().min(1).max(240),
          content: z.string().max(100_000),
        })).min(1).max(6),
        prTitle: z.string().min(1).max(180),
        prBody: z.string().min(1).max(8_000),
        verificationSummary: z.string().min(1).max(2_000),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ baseSha, branchName, files, prTitle, prBody, verificationSummary }) => {
      for (const file of files) assertSafePath(file.path);
      if (new Set(files.map((file) => file.path)).size !== files.length) {
        throw new Error('Duplicate file paths are not allowed');
      }

      const ref = await githubRequest<RefResponse>(
        `${repoPath()}/git/ref/heads/${encodeURIComponent(githubEnv.JARVIS_GITHUB_BASE_BRANCH)}`,
      );
      if (ref.object.sha !== baseSha) {
        throw new Error(`Base revision changed: expected ${baseSha}, current ${ref.object.sha}`);
      }

      const baseCommit = await githubRequest<CommitResponse>(`${repoPath()}/git/commits/${baseSha}`);
      const blobs = await Promise.all(files.map(async (file) => ({
        path: file.path,
        blob: await githubRequest<BlobResponse>(`${repoPath()}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
        }),
      })));

      const tree = await githubRequest<TreeResponse>(`${repoPath()}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseCommit.commit.tree.sha,
          tree: blobs.map(({ path, blob }) => ({ path, mode: '100644', type: 'blob', sha: blob.sha })),
        }),
      });
      const commit = await githubRequest<GitCommitResponse>(`${repoPath()}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
          message: `fix(demo): ${prTitle}`,
          tree: tree.sha,
          parents: [baseSha],
        }),
      });
      await githubRequest(`${repoPath()}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commit.sha }),
      });
      const pull = await githubRequest<PullResponse>(`${repoPath()}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
          title: prTitle,
          head: branchName,
          base: githubEnv.JARVIS_GITHUB_BASE_BRANCH,
          body: `${prBody}\n\n## Jarvis verification evidence\n\n${verificationSummary}`,
        }),
      });

      return textResult({
        published: true,
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        baseSha,
        commitSha: commit.sha,
        branchName,
        pullRequest: { number: pull.number, url: pull.html_url },
        changedFiles: files.map((file) => file.path),
      });
    },
  );
}
