import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let isValidJarvisBranchName: (value: string) => boolean;

beforeAll(async () => {
  process.env.JARVIS_GITHUB_MCP_BEARER_TOKEN = 'test-bearer-token-000000000000000000000000';
  process.env.JARVIS_GITHUB_TOKEN = 'github_pat_test_token_000000000000';
  process.env.JARVIS_GITHUB_REPOSITORY = 'example/demo';
  process.env.JARVIS_GITHUB_BASE_BRANCH = 'demo-product-main';
  ({ isValidJarvisBranchName } = await import('./github-tools.js'));
});

describe('GitHub operations safety contract', () => {
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

  it('keeps publication approval-gated in the TrueForge manifest', async () => {
    const setup = await readFile(fileURLToPath(new URL('../../../scripts/setup-trueforge.ts', import.meta.url)), 'utf8');
    expect(setup).toContain("requireApprovalForTools: ['publish_verified_fix']");
    expect(setup).toContain("enableTools: ['get_repository_snapshot', 'publish_verified_fix']");
  });
});
