import { Buffer } from 'node:buffer';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { githubEnv } from './github-config.js';
import { githubRequest, repoPath, textResult } from './github-tools.js';

const MAX_FILE_BYTES = 100_000;
const MAX_TASK_PROMPT_CHARS = 10_000;

const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  draft: z.boolean(),
  author: z.string().nullable(),
  url: z.string().url(),
  headBranch: z.string(),
  headSha: z.string(),
  baseBranch: z.string(),
  baseSha: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  mergedAt: z.string().nullable(),
  body: z.string().nullable(),
  mergeable: z.boolean().nullable(),
  mergeableState: z.string().nullable(),
  commits: z.number().int().nonnegative().nullable(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  changedFiles: z.number().int().nonnegative().nullable(),
});

const pullRequestFileSchema = z.object({
  sha: z.string(),
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  url: z.string().url(),
});

const pullRequestReviewSchema = z.object({
  id: z.number().int().positive(),
  author: z.string().nullable(),
  state: z.string(),
  body: z.string().nullable(),
  commitSha: z.string().nullable(),
  submittedAt: z.string().nullable(),
  url: z.string().url(),
});

const workflowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  path: z.string(),
  state: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowRunSchema = z.object({
  id: z.number().int().positive(),
  workflowId: z.number().int().positive(),
  runNumber: z.number().int().positive(),
  runAttempt: z.number().int().positive(),
  name: z.string().nullable(),
  event: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  headBranch: z.string().nullable(),
  headSha: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowJobSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  runnerName: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  url: z.string().url(),
});

const environmentSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
  updatedAt: z.string(),
  protectionRules: z.array(z.object({ type: z.string() })),
  deploymentBranchPolicy: z.object({
    protectedBranches: z.boolean(),
    customBranchPolicies: z.boolean(),
  }).nullable(),
});

const agentTaskSessionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  state: z.string(),
  prompt: z.string().nullable(),
  headRef: z.string().nullable(),
  baseRef: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

const agentTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  url: z.string().url(),
  sessionCount: z.number().int().nonnegative(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  artifacts: z.array(z.object({ provider: z.string(), type: z.string(), summary: z.string() })),
  sessions: z.array(agentTaskSessionSchema),
});

type PullRequestApi = {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  user?: { login?: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  body?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

type PullRequestFileApi = {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
};

type PullRequestReviewApi = {
  id: number;
  user?: { login?: string } | null;
  state: string;
  body?: string | null;
  commit_id?: string | null;
  submitted_at?: string | null;
  html_url: string;
};

type WorkflowApi = {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
};

type WorkflowRunApi = {
  id: number;
  workflow_id: number;
  run_number: number;
  run_attempt?: number;
  name?: string | null;
  event: string;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  head_sha: string;
  html_url: string;
  created_at: string;
  updated_at: string;
};

type WorkflowJobApi = {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
  runner_name?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  html_url: string;
};

type EnvironmentApi = {
  id: number;
  name: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  protection_rules?: Array<{ type?: string }>;
  deployment_branch_policy?: {
    protected_branches?: boolean;
    custom_branch_policies?: boolean;
  } | null;
};

type AgentTaskSessionApi = {
  id: string;
  name?: string | null;
  state: string;
  prompt?: string | null;
  head_ref?: string | null;
  base_ref?: string | null;
  model?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

type AgentTaskApi = {
  id: string;
  name: string;
  state: string;
  html_url: string;
  session_count?: number;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  artifacts?: Array<{ provider?: string; type?: string; data?: unknown }>;
  sessions?: AgentTaskSessionApi[];
};

type RepositoryContentApi = {
  type: string;
  encoding?: string;
  content?: string;
  size: number;
  name: string;
  path: string;
  sha: string;
  html_url: string | null;
};

export function githubHeadFilter(headBranch?: string): string | undefined {
  if (!headBranch) return undefined;
  const separator = headBranch.indexOf(':');
  if (separator !== -1) {
    const owner = headBranch.slice(0, separator);
    const ref = headBranch.slice(separator + 1);
    if (!owner || !ref) {
      throw new Error('GitHub head filters must use owner:branch format');
    }
    return `${owner}:${ref}`;
  }
  return `${githubEnv.JARVIS_GITHUB_REPOSITORY.split('/')[0]}:${headBranch}`;
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : '';
}

function encodeRepositoryPath(path: string): string {
  const segments = path.split('/');
  if (!path || path.startsWith('/') || segments.includes('..') || path.includes('\0')) {
    throw new Error('Repository path must be a relative path without parent traversal');
  }
  return segments.map(encodeURIComponent).join('/');
}

function normalizePullRequest(pull: PullRequestApi) {
  return {
    number: pull.number,
    title: pull.title,
    state: pull.state,
    draft: Boolean(pull.draft),
    author: pull.user?.login ?? null,
    url: pull.html_url,
    headBranch: pull.head.ref,
    headSha: pull.head.sha,
    baseBranch: pull.base.ref,
    baseSha: pull.base.sha,
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    closedAt: pull.closed_at ?? null,
    mergedAt: pull.merged_at ?? null,
    body: pull.body ?? null,
    mergeable: pull.mergeable ?? null,
    mergeableState: pull.mergeable_state ?? null,
    commits: pull.commits ?? null,
    additions: pull.additions ?? null,
    deletions: pull.deletions ?? null,
    changedFiles: pull.changed_files ?? null,
  };
}

function normalizeWorkflow(workflow: WorkflowApi) {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    url: workflow.html_url,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at,
  };
}

function normalizeWorkflowRun(run: WorkflowRunApi) {
  return {
    id: run.id,
    workflowId: run.workflow_id,
    runNumber: run.run_number,
    runAttempt: run.run_attempt ?? 1,
    name: run.name ?? null,
    event: run.event,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    headBranch: run.head_branch ?? null,
    headSha: run.head_sha,
    url: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

function normalizeEnvironment(environment: EnvironmentApi) {
  const policy = environment.deployment_branch_policy;
  return {
    id: environment.id,
    name: environment.name,
    url: environment.html_url,
    createdAt: environment.created_at,
    updatedAt: environment.updated_at,
    protectionRules: (environment.protection_rules ?? []).map((rule) => ({ type: rule.type ?? 'unknown' })),
    deploymentBranchPolicy: policy
      ? {
          protectedBranches: Boolean(policy.protected_branches),
          customBranchPolicies: Boolean(policy.custom_branch_policies),
        }
      : null,
  };
}

function normalizeAgentTask(task: AgentTaskApi) {
  return {
    id: task.id,
    name: task.name,
    state: task.state,
    url: task.html_url,
    sessionCount: task.session_count ?? 0,
    archivedAt: task.archived_at ?? null,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    artifacts: (task.artifacts ?? []).map((artifact) => ({
      provider: artifact.provider ?? 'unknown',
      type: artifact.type ?? 'unknown',
      summary: JSON.stringify(artifact.data ?? {}).slice(0, 2_000),
    })),
    sessions: (task.sessions ?? []).map((session) => ({
      id: session.id,
      name: session.name ?? null,
      state: session.state,
      prompt: session.prompt ?? null,
      headRef: session.head_ref ?? null,
      baseRef: session.base_ref ?? null,
      model: session.model ?? null,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      completedAt: session.completed_at ?? null,
    })),
  };
}

function agentRepoPath(): string {
  return `/agents/repos/${githubEnv.JARVIS_GITHUB_REPOSITORY}`;
}

export function registerGithubPermissionTools(server: McpServer): void {
  server.registerTool(
    'read_repository_file',
    {
      title: 'Read repository file',
      description: 'Read one bounded UTF-8 text file from the fixed repository. Defaults to the configured base branch.',
      inputSchema: {
        path: z.string().min(1).max(240),
        ref: z.string().min(1).max(255).optional(),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          ref: z.string(),
          path: z.string(),
          name: z.string(),
          sha: z.string(),
          size: z.number().int().nonnegative(),
          url: z.string().url().nullable(),
          content: z.string(),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ path, ref }) => {
      const targetRef = ref ?? githubEnv.JARVIS_GITHUB_BASE_BRANCH;
      const content = await githubRequest<RepositoryContentApi | RepositoryContentApi[]>(
        `${repoPath()}/contents/${encodeRepositoryPath(path)}${queryString({ ref: targetRef })}`,
      );
      if (Array.isArray(content) || content.type !== 'file' || content.encoding !== 'base64') {
        throw new Error('The requested repository path is not a directly readable file');
      }
      if (content.size > MAX_FILE_BYTES) {
        throw new Error(`Repository file exceeds the ${MAX_FILE_BYTES}-byte read limit`);
      }
      const decoded = Buffer.from((content.content ?? '').replace(/\s/g, ''), 'base64').toString('utf8');
      if (decoded.includes('\0')) throw new Error('Binary repository files are not returned by this tool');
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        ref: targetRef,
        path: content.path,
        name: content.name,
        sha: content.sha,
        size: content.size,
        url: content.html_url,
        content: decoded,
      });
    },
  );

  server.registerTool(
    'list_pull_requests',
    {
      title: 'List pull requests',
      description: 'List pull requests from the fixed repository using the authenticated GitHub API. Use this for open or remaining PR status instead of public web search. headBranch may be a same-repo branch name or an owner:branch filter for fork heads.',
      inputSchema: {
        state: z.enum(['open', 'closed', 'all']).default('open'),
        baseBranch: z.string().min(1).max(255).optional(),
        headBranch: z.string().min(1).max(255).optional(),
        sort: z.enum(['created', 'updated', 'popularity', 'long-running']).default('updated'),
        direction: z.enum(['asc', 'desc']).default('desc'),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(30),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          page: z.number().int().positive(),
          perPage: z.number().int().positive(),
          count: z.number().int().nonnegative(),
          pullRequests: z.array(pullRequestSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ state, baseBranch, headBranch, sort, direction, page, perPage }) => {
      const pulls = await githubRequest<PullRequestApi[]>(`${repoPath()}/pulls${queryString({
        state,
        base: baseBranch,
        head: githubHeadFilter(headBranch),
        sort,
        direction,
        page,
        per_page: perPage,
      })}`);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        page,
        perPage,
        count: pulls.length,
        pullRequests: pulls.map(normalizePullRequest),
      });
    },
  );

  server.registerTool(
    'get_pull_request',
    {
      title: 'Get pull request',
      description: 'Get current metadata and mergeability details for one pull request in the fixed repository.',
      inputSchema: { pullNumber: z.number().int().positive() },
      outputSchema: {
        result: z.object({ repository: z.string(), pullRequest: pullRequestSchema }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ pullNumber }) => {
      const pull = await githubRequest<PullRequestApi>(`${repoPath()}/pulls/${pullNumber}`);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullRequest: normalizePullRequest(pull),
      });
    },
  );

  server.registerTool(
    'list_pull_request_files',
    {
      title: 'List pull request files',
      description: 'List changed file names and statistics for one pull request.',
      inputSchema: {
        pullNumber: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(100),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          pullNumber: z.number().int().positive(),
          page: z.number().int().positive(),
          count: z.number().int().nonnegative(),
          files: z.array(pullRequestFileSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ pullNumber, page, perPage }) => {
      const files = await githubRequest<PullRequestFileApi[]>(
        `${repoPath()}/pulls/${pullNumber}/files${queryString({ page, per_page: perPage })}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullNumber,
        page,
        count: files.length,
        files: files.map((file) => ({
          sha: file.sha,
          path: file.filename,
          previousPath: file.previous_filename ?? null,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          url: file.blob_url,
        })),
      });
    },
  );

  server.registerTool(
    'list_pull_request_reviews',
    {
      title: 'List pull request reviews',
      description: 'List submitted reviews for one pull request.',
      inputSchema: {
        pullNumber: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(100),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          pullNumber: z.number().int().positive(),
          page: z.number().int().positive(),
          count: z.number().int().nonnegative(),
          reviews: z.array(pullRequestReviewSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ pullNumber, page, perPage }) => {
      const reviews = await githubRequest<PullRequestReviewApi[]>(
        `${repoPath()}/pulls/${pullNumber}/reviews${queryString({ page, per_page: perPage })}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullNumber,
        page,
        count: reviews.length,
        reviews: reviews.map((review) => ({
          id: review.id,
          author: review.user?.login ?? null,
          state: review.state,
          body: review.body ?? null,
          commitSha: review.commit_id ?? null,
          submittedAt: review.submitted_at ?? null,
          url: review.html_url,
        })),
      });
    },
  );

  server.registerTool(
    'list_workflows',
    {
      title: 'List workflows',
      description: 'List GitHub Actions workflows in the fixed repository.',
      inputSchema: {
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(100),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          totalCount: z.number().int().nonnegative(),
          page: z.number().int().positive(),
          workflows: z.array(workflowSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page, perPage }) => {
      const response = await githubRequest<{ total_count: number; workflows: WorkflowApi[] }>(
        `${repoPath()}/actions/workflows${queryString({ page, per_page: perPage })}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        totalCount: response.total_count,
        page,
        workflows: response.workflows.map(normalizeWorkflow),
      });
    },
  );

  server.registerTool(
    'list_workflow_runs',
    {
      title: 'List workflow runs',
      description: 'List GitHub Actions workflow runs with optional branch, event, and status filters.',
      inputSchema: {
        branch: z.string().min(1).max(255).optional(),
        event: z.string().min(1).max(80).optional(),
        status: z.string().min(1).max(80).optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(30),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          totalCount: z.number().int().nonnegative(),
          page: z.number().int().positive(),
          runs: z.array(workflowRunSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ branch, event, status, page, perPage }) => {
      const response = await githubRequest<{ total_count: number; workflow_runs: WorkflowRunApi[] }>(
        `${repoPath()}/actions/runs${queryString({ branch, event, status, page, per_page: perPage })}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        totalCount: response.total_count,
        page,
        runs: response.workflow_runs.map(normalizeWorkflowRun),
      });
    },
  );

  server.registerTool(
    'get_workflow_run',
    {
      title: 'Get workflow run',
      description: 'Get one workflow run and its bounded job summary.',
      inputSchema: {
        runId: z.number().int().positive(),
        jobsPage: z.number().int().min(1).default(1),
        jobsPerPage: z.number().int().min(1).max(100).default(100),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          run: workflowRunSchema,
          totalJobs: z.number().int().nonnegative(),
          jobs: z.array(workflowJobSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ runId, jobsPage, jobsPerPage }) => {
      const [run, jobs] = await Promise.all([
        githubRequest<WorkflowRunApi>(`${repoPath()}/actions/runs/${runId}`),
        githubRequest<{ total_count: number; jobs: WorkflowJobApi[] }>(
          `${repoPath()}/actions/runs/${runId}/jobs${queryString({ page: jobsPage, per_page: jobsPerPage })}`,
        ),
      ]);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        run: normalizeWorkflowRun(run),
        totalJobs: jobs.total_count,
        jobs: jobs.jobs.map((job) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion ?? null,
          runnerName: job.runner_name ?? null,
          startedAt: job.started_at ?? null,
          completedAt: job.completed_at ?? null,
          url: job.html_url,
        })),
      });
    },
  );

  server.registerTool(
    'list_environments',
    {
      title: 'List environments',
      description: 'List deployment environments and their protection-rule summaries.',
      inputSchema: {
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(100),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          totalCount: z.number().int().nonnegative(),
          page: z.number().int().positive(),
          environments: z.array(environmentSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page, perPage }) => {
      const response = await githubRequest<{ total_count: number; environments: EnvironmentApi[] }>(
        `${repoPath()}/environments${queryString({ page, per_page: perPage })}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        totalCount: response.total_count,
        page,
        environments: response.environments.map(normalizeEnvironment),
      });
    },
  );

  server.registerTool(
    'get_environment',
    {
      title: 'Get environment',
      description: 'Get one deployment environment and its protection-rule summary.',
      inputSchema: { environmentName: z.string().min(1).max(255) },
      outputSchema: {
        result: z.object({ repository: z.string(), environment: environmentSchema }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ environmentName }) => {
      const environment = await githubRequest<EnvironmentApi>(
        `${repoPath()}/environments/${encodeURIComponent(environmentName)}`,
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        environment: normalizeEnvironment(environment),
      });
    },
  );

  server.registerTool(
    'list_agent_tasks',
    {
      title: 'List agent tasks',
      description: 'List GitHub Copilot cloud agent tasks for the fixed repository. This GitHub API is in public preview and requires a supported user token.',
      inputSchema: {
        states: z.array(z.enum([
          'queued',
          'in_progress',
          'completed',
          'failed',
          'idle',
          'waiting_for_user',
          'timed_out',
          'cancelled',
        ])).max(8).optional(),
        archived: z.boolean().default(false),
        sort: z.enum(['updated_at', 'created_at']).default('updated_at'),
        direction: z.enum(['asc', 'desc']).default('desc'),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(30),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          page: z.number().int().positive(),
          count: z.number().int().nonnegative(),
          tasks: z.array(agentTaskSchema),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ states, archived, sort, direction, page, perPage }) => {
      const response = await githubRequest<{ tasks: AgentTaskApi[] }>(`${agentRepoPath()}/tasks${queryString({
        state: states?.join(','),
        is_archived: archived,
        sort,
        direction,
        page,
        per_page: perPage,
      })}`);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        page,
        count: response.tasks.length,
        tasks: response.tasks.map(normalizeAgentTask),
      });
    },
  );

  server.registerTool(
    'get_agent_task',
    {
      title: 'Get agent task',
      description: 'Get one GitHub Copilot cloud agent task by repository-scoped task ID.',
      inputSchema: { taskId: z.string().uuid() },
      outputSchema: {
        result: z.object({ repository: z.string(), task: agentTaskSchema }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ taskId }) => {
      const task = await githubRequest<AgentTaskApi>(`${agentRepoPath()}/tasks/${encodeURIComponent(taskId)}`);
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        task: normalizeAgentTask(task),
      });
    },
  );

  server.registerTool(
    'update_pull_request',
    {
      title: 'Update pull request',
      description: 'Update bounded pull-request metadata in the fixed repository. Closing a pull request is supported; merging is intentionally not exposed.',
      inputSchema: {
        pullNumber: z.number().int().positive(),
        title: z.string().min(1).max(256).optional(),
        body: z.string().max(20_000).nullable().optional(),
        state: z.enum(['open', 'closed']).optional(),
        baseBranch: z.string().min(1).max(255).optional(),
      },
      outputSchema: {
        result: z.object({ repository: z.string(), pullRequest: pullRequestSchema }),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ pullNumber, title, body, state, baseBranch }) => {
      const updates = {
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(baseBranch !== undefined ? { base: baseBranch } : {}),
      };
      if (Object.keys(updates).length === 0) throw new Error('At least one pull-request update is required');
      const pull = await githubRequest<PullRequestApi>(`${repoPath()}/pulls/${pullNumber}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullRequest: normalizePullRequest(pull),
      });
    },
  );

  server.registerTool(
    'request_pull_request_reviewers',
    {
      title: 'Request pull request reviewers',
      description: 'Request bounded user or team reviews on one pull request in the fixed repository.',
      inputSchema: {
        pullNumber: z.number().int().positive(),
        reviewers: z.array(z.string().min(1).max(100)).max(10).optional(),
        teamReviewers: z.array(z.string().min(1).max(100)).max(10).optional(),
      },
      outputSchema: {
        result: z.object({ repository: z.string(), pullRequest: pullRequestSchema }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ pullNumber, reviewers, teamReviewers }) => {
      if ((reviewers?.length ?? 0) + (teamReviewers?.length ?? 0) === 0) {
        throw new Error('At least one user or team reviewer is required');
      }
      const pull = await githubRequest<PullRequestApi>(`${repoPath()}/pulls/${pullNumber}/requested_reviewers`, {
        method: 'POST',
        body: JSON.stringify({ reviewers: reviewers ?? [], team_reviewers: teamReviewers ?? [] }),
      });
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullRequest: normalizePullRequest(pull),
      });
    },
  );

  server.registerTool(
    'submit_pull_request_review',
    {
      title: 'Submit pull request review',
      description: 'Submit a pull-request comment, approval, or change request in the fixed repository.',
      inputSchema: {
        pullNumber: z.number().int().positive(),
        body: z.string().min(1).max(8_000),
        event: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']),
        commitSha: z.string().regex(/^[0-9a-f]{40}$/i).optional(),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          pullNumber: z.number().int().positive(),
          review: pullRequestReviewSchema,
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ pullNumber, body, event, commitSha }) => {
      const review = await githubRequest<PullRequestReviewApi>(`${repoPath()}/pulls/${pullNumber}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ body, event, ...(commitSha ? { commit_id: commitSha } : {}) }),
      });
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        pullNumber,
        review: {
          id: review.id,
          author: review.user?.login ?? null,
          state: review.state,
          body: review.body ?? null,
          commitSha: review.commit_id ?? null,
          submittedAt: review.submitted_at ?? null,
          url: review.html_url,
        },
      });
    },
  );

  server.registerTool(
    'dispatch_workflow',
    {
      title: 'Dispatch workflow',
      description: 'Dispatch a workflow_dispatch-enabled GitHub Actions workflow on a bounded ref.',
      inputSchema: {
        workflowId: z.union([z.number().int().positive(), z.string().min(1).max(255)]),
        ref: z.string().min(1).max(255).optional(),
        inputs: z.record(z.string().min(1).max(100), z.string().max(1_000)).optional(),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          workflowId: z.string(),
          ref: z.string(),
          accepted: z.boolean(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ workflowId, ref, inputs }) => {
      if (inputs && Object.keys(inputs).length > 20) throw new Error('Workflow dispatch accepts at most 20 inputs');
      const targetRef = ref ?? githubEnv.JARVIS_GITHUB_BASE_BRANCH;
      await githubRequest<void>(`${repoPath()}/actions/workflows/${encodeURIComponent(String(workflowId))}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: targetRef, ...(inputs ? { inputs } : {}) }),
      });
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        workflowId: String(workflowId),
        ref: targetRef,
        accepted: true,
      });
    },
  );

  server.registerTool(
    'rerun_workflow_run',
    {
      title: 'Rerun workflow run',
      description: 'Rerun all jobs or only failed jobs for one GitHub Actions workflow run.',
      inputSchema: {
        runId: z.number().int().positive(),
        mode: z.enum(['all', 'failed']).default('all'),
        enableDebugLogging: z.boolean().default(false),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          runId: z.number().int().positive(),
          mode: z.enum(['all', 'failed']),
          accepted: z.boolean(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ runId, mode, enableDebugLogging }) => {
      const suffix = mode === 'failed' ? 'rerun-failed-jobs' : 'rerun';
      await githubRequest<void>(`${repoPath()}/actions/runs/${runId}/${suffix}`, {
        method: 'POST',
        body: JSON.stringify({ enable_debug_logging: enableDebugLogging }),
      });
      return textResult({ repository: githubEnv.JARVIS_GITHUB_REPOSITORY, runId, mode, accepted: true });
    },
  );

  server.registerTool(
    'cancel_workflow_run',
    {
      title: 'Cancel workflow run',
      description: 'Cancel or force-cancel one in-progress GitHub Actions workflow run.',
      inputSchema: {
        runId: z.number().int().positive(),
        force: z.boolean().default(false),
      },
      outputSchema: {
        result: z.object({
          repository: z.string(),
          runId: z.number().int().positive(),
          force: z.boolean(),
          accepted: z.boolean(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ runId, force }) => {
      await githubRequest<void>(`${repoPath()}/actions/runs/${runId}/${force ? 'force-cancel' : 'cancel'}`, {
        method: 'POST',
      });
      return textResult({ repository: githubEnv.JARVIS_GITHUB_REPOSITORY, runId, force, accepted: true });
    },
  );

  server.registerTool(
    'configure_environment',
    {
      title: 'Configure environment',
      description: 'Create or update bounded deployment-environment protection settings. Secrets and environment deletion are intentionally not exposed.',
      inputSchema: {
        environmentName: z.string().min(1).max(255),
        waitTimer: z.number().int().min(0).max(43_200).optional(),
        preventSelfReview: z.boolean().optional(),
        reviewers: z.array(z.object({
          type: z.enum(['User', 'Team']),
          id: z.number().int().positive(),
        })).max(6).optional(),
        deploymentBranchPolicy: z.object({
          protectedBranches: z.boolean(),
          customBranchPolicies: z.boolean(),
        }).optional(),
      },
      outputSchema: {
        result: z.object({ repository: z.string(), environment: environmentSchema }),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ environmentName, waitTimer, preventSelfReview, reviewers, deploymentBranchPolicy }) => {
      const body = {
        ...(waitTimer !== undefined ? { wait_timer: waitTimer } : {}),
        ...(preventSelfReview !== undefined ? { prevent_self_review: preventSelfReview } : {}),
        ...(reviewers !== undefined ? { reviewers } : {}),
        ...(deploymentBranchPolicy !== undefined
          ? {
              deployment_branch_policy: {
                protected_branches: deploymentBranchPolicy.protectedBranches,
                custom_branch_policies: deploymentBranchPolicy.customBranchPolicies,
              },
            }
          : {}),
      };
      if (Object.keys(body).length === 0) throw new Error('At least one environment setting is required');
      const environment = await githubRequest<EnvironmentApi>(
        `${repoPath()}/environments/${encodeURIComponent(environmentName)}`,
        { method: 'PUT', body: JSON.stringify(body) },
      );
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        environment: normalizeEnvironment(environment),
      });
    },
  );

  server.registerTool(
    'start_agent_task',
    {
      title: 'Start agent task',
      description: 'Start a GitHub Copilot cloud agent task for the fixed repository. This preview API requires a supported user token and Copilot plan.',
      inputSchema: {
        prompt: z.string().min(1).max(MAX_TASK_PROMPT_CHARS),
        baseRef: z.string().min(1).max(255).optional(),
      },
      outputSchema: {
        result: z.object({ repository: z.string(), task: agentTaskSchema }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ prompt, baseRef }) => {
      const task = await githubRequest<AgentTaskApi>(`${agentRepoPath()}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ prompt, base_ref: baseRef ?? githubEnv.JARVIS_GITHUB_BASE_BRANCH }),
      });
      return textResult({
        repository: githubEnv.JARVIS_GITHUB_REPOSITORY,
        task: normalizeAgentTask(task),
      });
    },
  );
}
