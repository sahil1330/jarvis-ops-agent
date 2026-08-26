import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUrlHost, githubConfigChecks, regressionCommitProblem, resumeLimitMiB } from './doctor-github.js';

function baseEnv() {
  return {
    JARVIS_GITHUB_MCP_BEARER_TOKEN: 'g'.repeat(64),
    JARVIS_GITHUB_TOKEN: 'configured-token',
    JARVIS_GITHUB_REPOSITORY: 'sahil1330/jarvis-ops-agent',
    JARVIS_GITHUB_BASE_BRANCH: 'demo/client-regression',
    GITHUB_MCP_HOST: '127.0.0.1',
  };
}

describe('Jarvis GitHub doctor', () => {
  it('accepts the isolated golden-mission connector configuration', () => {
    const checks = githubConfigChecks(baseEnv());
    assert.equal(checks.some((item) => item.status === 'fail'), false);
    assert.equal(checks.find((item) => item.name === 'Config · Golden repository')?.status, 'pass');
    assert.equal(checks.find((item) => item.name === 'Config · Golden regression branch')?.status, 'pass');
  });

  it('blocks a different repository even when its slug is otherwise valid', () => {
    const checks = githubConfigChecks({ ...baseEnv(), JARVIS_GITHUB_REPOSITORY: 'sahil1330/other-demo' });
    const repository = checks.find((item) => item.name === 'Config · Golden repository');
    assert.equal(repository?.status, 'fail');
    assert.match(repository?.fix ?? '', /sahil1330\/jarvis-ops-agent/);
  });

  it('blocks accidentally pointing the golden mission at main', () => {
    const checks = githubConfigChecks({ ...baseEnv(), JARVIS_GITHUB_BASE_BRANCH: 'main' });
    const branch = checks.find((item) => item.name === 'Config · Golden regression branch');
    assert.equal(branch?.status, 'fail');
    assert.match(branch?.fix ?? '', /demo\/client-regression/);
  });

  it('blocks exposing the write-capable GitHub MCP beyond loopback', () => {
    const checks = githubConfigChecks({ ...baseEnv(), GITHUB_MCP_HOST: '0.0.0.0' });
    const exposure = checks.find((item) => item.name === 'Config · GitHub MCP exposure');
    assert.equal(exposure?.status, 'fail');
    assert.match(exposure?.fix ?? '', /127\.0\.0\.1/);
  });

  it('formats an accepted IPv6 loopback as a valid URL host', () => {
    assert.equal(formatUrlHost('::1'), '[::1]');
    assert.equal(formatUrlHost('127.0.0.1'), '127.0.0.1');
  });

  it('requires an independent strong GitHub MCP bearer token', () => {
    const checks = githubConfigChecks({ ...baseEnv(), JARVIS_GITHUB_MCP_BEARER_TOKEN: 'short' });
    const bearer = checks.find((item) => item.name === 'Config · GitHub MCP bearer strength');
    assert.equal(bearer?.status, 'fail');
    assert.match(bearer?.fix ?? '', /openssl rand -hex 32/);
  });

  it('parses exactly one active upload-limit declaration instead of comments or duplicates', () => {
    assert.equal(resumeLimitMiB('const MAX_RESUME_BYTES = 1 * 1024 * 1024;\n'), 1);
    assert.equal(resumeLimitMiB('// const MAX_RESUME_BYTES = 1 * 1024 * 1024;\nconst MAX_RESUME_BYTES = 6 * 1024 * 1024;\n'), 6);
    assert.equal(resumeLimitMiB('const MAX_RESUME_BYTES = 1 * 1024 * 1024;\nconst MAX_RESUME_BYTES = 6 * 1024 * 1024;\n'), null);
  });

  it('requires the regression tip commit to modify only the demo product implementation', () => {
    assert.equal(regressionCommitProblem({
      parents: [{ sha: 'a'.repeat(40) }],
      files: [{ filename: 'demo-lab/src/product.js', status: 'modified' }],
    }), null);

    assert.match(regressionCommitProblem({
      parents: [{ sha: 'a'.repeat(40) }],
      files: [
        { filename: 'demo-lab/src/product.js', status: 'modified' },
        { filename: 'README.md', status: 'modified' },
      ],
    }) ?? '', /exactly one file/);
  });
});
