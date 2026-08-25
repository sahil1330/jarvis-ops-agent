import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { configChecks, memoryPathForDoctor, redactError } from './doctor-core.js';

function baseEnv() {
  return {
    JARVIS_MCP_BEARER_TOKEN: 'x'.repeat(64),
    OPENAI_API_KEY: 'configured',
    GOOGLE_CLIENT_ID: 'configured',
    GOOGLE_CLIENT_SECRET: 'configured',
    GOOGLE_REFRESH_TOKEN: 'configured',
    ORCHESTRATOR_HOST: '127.0.0.1',
    JARVIS_DEMO_MODE: 'false',
  };
}

describe('Jarvis doctor', () => {
  it('warns about a legacy literal Gmail mailbox without blocking users/me', () => {
    const checks = configChecks({ ...baseEnv(), GOOGLE_USER_EMAIL: 'someone@example.com' });
    const mailbox = checks.find((item) => item.name === 'Config · Gmail mailbox identity');
    assert.equal(mailbox?.status, 'warn');
    assert.match(mailbox?.detail ?? '', /ignored.*users\/me/i);
  });

  it('blocks exposing the unauthenticated local orchestrator off loopback', () => {
    const checks = configChecks({ ...baseEnv(), ORCHESTRATOR_HOST: '0.0.0.0' });
    const exposure = checks.find((item) => item.name === 'Config · Orchestrator exposure');
    assert.equal(exposure?.status, 'fail');
    assert.match(exposure?.fix ?? '', /127\.0\.0\.1/);
  });

  it('blocks demo mode unless explicitly allowed', () => {
    const env = { ...baseEnv(), JARVIS_DEMO_MODE: 'true' };
    assert.equal(configChecks(env).find((item) => item.name === 'Config · Live demo mode')?.status, 'fail');
    assert.equal(configChecks(env, true).find((item) => item.name === 'Config · Live demo mode')?.status, 'warn');
  });

  it('redacts OAuth and bearer secrets from diagnostics', () => {
    const redacted = redactError('Bearer abc.def refresh_token=secret-value client_secret:top-secret');
    assert.doesNotMatch(redacted, /abc\.def|secret-value|top-secret/);
    assert.match(redacted, /\[redacted\]/);
  });

  it('resolves memory paths from the repository root', () => {
    const defaultPath = memoryPathForDoctor(undefined).replaceAll('\\', '/');
    const explicitPath = memoryPathForDoctor('.jarvis/custom.json').replaceAll('\\', '/');
    assert.match(defaultPath, /jarvis-ops-agent\/\.jarvis\/memory\.json$/);
    assert.match(explicitPath, /jarvis-ops-agent\/\.jarvis\/custom\.json$/);
  });
});
