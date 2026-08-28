import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let gitCommitTreeSha: (commit: { sha: string; tree: { sha: string } }) => string;
let githubHeadFilter: (headBranch?: string) => string | undefined;
let isValidJarvisBranchName: (value: string) => boolean;

beforeAll(async () => {
  process.env.JARVIS_GITHUB_MCP_BEARER_TOKEN = 'test-bearer-token-000000000000000000000000';
  process.env.JARVIS_GITHUB_TOKEN = 'github_pat_test_token_000000000000';
  process.env.JARVIS_GITHUB_REPOSITORY = 'example/demo';
  process.env.JARVIS_GITHUB_BASE_BRANCH = 'demo-product-main';
  ({ gitCommitTreeSha, isValidJarvisBranchName } = await import('./github-tools.js'));
  ({ githubHeadFilter } = await import('./github-permission-tools.js'));
});

describe('GitHub operations safety contract', () => {
  it('reads the base tree from the Git Data commit response shape', () => {
    expect(gitCommitTreeSha({
      sha: '1'.repeat(40),
      tree: { sha: '2'.repeat(40) },
    })).toBe('2'.repeat(40));
  });

  it('reports a malformed Git Data commit response clearly', () => {
    expect(() => gitCommitTreeSha({ sha: '1'.repeat(40) } as never)).toThrow(
      'GitHub Git commit response did not include a tree SHA',
    );
  });

  it('accepts a normal namespaced branch', () => {
    expect(isValidJarvisBranchName('jarvis/fix-resume-upload')).toBe(true);
  });

  it.each([
    'jarvis/foo..bar',
    'jarvis/foo//bar',
    'jarvis/foo/',
    'jarvis/foo.',
    'jarvis/.hidden/fix',
    'jarvis/foo.lock',
    'other/fix',
  ])('rejects invalid Git ref name %s', (branch) => {
    expect(isValidJarvisBranchName(branch)).toBe(false);
  });

  it('rechecks the base before branch publication and cleans up a stranded ref', async () => {
    const source = await readFile(fileURLToPath(new URL('./github-tools.ts', import.meta.url)), 'utf8');
    expect(source).toContain("const ALLOWED_PREFIX = 'demo-lab/'");
    expect(source.match(/assertCurrentBase\(baseSha, await currentBaseSha\(\)\)/g)).toHaveLength(2);
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain("'publish_verified_fix'");
  });

  it('qualifies same-repo head branches for GitHub list filters', () => {
    expect(githubHeadFilter()).toBeUndefined();
    expect(githubHeadFilter('jarvis/fix-resume-upload')).toBe('example:jarvis/fix-resume-upload');
    expect(githubHeadFilter('fork-owner:feature/from-fork')).toBe('fork-owner:feature/from-fork');
    expect(() => githubHeadFilter('owner:')).toThrow('GitHub head filters must use owner:branch format');
  });

  it('registers permission-aligned reads with explicit output contracts', async () => {
    const source = await readFile(fileURLToPath(new URL('./github-permission-tools.ts', import.meta.url)), 'utf8');
    for (const tool of [
      'read_repository_file',
      'list_pull_requests',
      'get_pull_request',
      'list_pull_request_files',
      'list_pull_request_reviews',
      'list_workflows',
      'list_workflow_runs',
      'get_workflow_run',
      'list_environments',
      'get_environment',
      'list_agent_tasks',
      'get_agent_task',
    ]) {
      expect(source).toContain(`'${tool}'`);
    }
    expect(source.match(/outputSchema:/g)?.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps every GitHub mutation approval-gated in the TrueForge manifest', async () => {
    const setup = await readFile(fileURLToPath(new URL('../../../scripts/setup-trueforge.ts', import.meta.url)), 'utf8');
    expect(setup).toContain('requireApprovalForTools: githubWriteTools');
    expect(setup).toContain('enableTools: [...githubReadTools, ...githubWriteTools]');
    expect(setup).toContain("preloadTools: ['get_repository_snapshot', 'list_pull_requests']");
    for (const tool of [
      'publish_verified_fix',
      'update_pull_request',
      'request_pull_request_reviewers',
      'submit_pull_request_review',
      'dispatch_workflow',
      'rerun_workflow_run',
      'cancel_workflow_run',
      'configure_environment',
      'start_agent_task',
    ]) {
      expect(setup).toContain(`'${tool}'`);
    }
  });
});
