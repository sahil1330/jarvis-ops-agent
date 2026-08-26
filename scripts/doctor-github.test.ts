import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { githubConfigChecks } from './doctor-github.js';

function baseEnv() {
  return {
    JARVIS_GITHUB_MCP_BEARER_TOKEN: 'g'.repeat(64),
    JARVIS_GITHUB_TOKEN: 'configured-token',
    JARVIS_GITHUB_REPOSITORY: 'sahil1330/jarvis-ops-agent',
    JARVIS_GITHUB_BASE_BRANCH: 'demo/client-regression',
    GITHUB_MCP_HOST: '127.0.0.1',
  };
}

describe('Jarvis GitHub doctor config', () => {
  it('accepts the isolated golden-mission connector configuration', () => {
    const checks = githubConfigChecks(baseEnv());
    assert.equal(checks.some((item) => item.status === 'fail'), false);
    assert.equal(checks.find((item) => item.name === 'Config · Golden regression branch')?.status, 'pass');
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

  it('requires an independent strong GitHub MCP bearer token', () => {
    const checks = githubConfigChecks({ ...baseEnv(), JARVIS_GITHUB_MCP_BEARER_TOKEN: 'short' });
    const bearer = checks.find((item) => item.name === 'Config · GitHub MCP bearer strength');
    assert.equal(bearer?.status, 'fail');
    assert.match(bearer?.fix ?? '', /openssl rand -hex 32/);
  });
});
