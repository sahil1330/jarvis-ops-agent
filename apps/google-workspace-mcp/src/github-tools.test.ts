import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('GitHub operations safety contract', () => {
  it('allowlists demo-lab writes and rejects stale base revisions', async () => {
    const source = await readFile(fileURLToPath(new URL('./github-tools.ts', import.meta.url)), 'utf8');
    expect(source).toContain("const ALLOWED_PREFIX = 'demo-lab/'");
    expect(source).toContain('Base revision changed');
    expect(source).toContain("'publish_verified_fix'");
    expect(source).toContain("'get_repository_snapshot'");
  });

  it('keeps publication approval-gated in the TrueForge manifest', async () => {
    const setup = await readFile(fileURLToPath(new URL('../../../scripts/setup-trueforge.ts', import.meta.url)), 'utf8');
    expect(setup).toContain("requireApprovalForTools: ['publish_verified_fix']");
    expect(setup).toContain("enableTools: ['get_repository_snapshot', 'publish_verified_fix']");
  });
});
