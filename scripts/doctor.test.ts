import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { configChecks, memoryPathForDoctor, redactError } from './doctor-core.js';

describe('Jarvis doctor', () => {
  it('treats personal OAuth mailbox delegation as a blocker', () => {
    const checks = configChecks({
      JARVIS_MCP_BEARER_TOKEN: 'x'.repeat(64),
      OPENAI_API_KEY: 'configured',
      GOOGLE_CLIENT_ID: 'configured',
      GOOGLE_CLIENT_SECRET: 'configured',
      GOOGLE_REFRESH_TOKEN: 'configured',
      GOOGLE_USER_EMAIL: 'someone@example.com',
      JARVIS_DEMO_MODE: 'false',
    });

    const mailbox = checks.find((item) => item.name === 'Config · Gmail mailbox identity');
    assert.equal(mailbox?.status, 'fail');
    assert.match(mailbox?.fix ?? '', /GOOGLE_USER_EMAIL=me/);
  });

  it('blocks demo mode unless explicitly allowed', () => {
    const env = {
      JARVIS_MCP_BEARER_TOKEN: 'x'.repeat(64),
      OPENAI_API_KEY: 'configured',
      GOOGLE_CLIENT_ID: 'configured',
      GOOGLE_CLIENT_SECRET: 'configured',
      GOOGLE_REFRESH_TOKEN: 'configured',
      GOOGLE_USER_EMAIL: 'me',
      JARVIS_DEMO_MODE: 'true',
    };
    assert.equal(configChecks(env).find((item) => item.name === 'Config · Live demo mode')?.status, 'fail');
    assert.equal(configChecks(env, true).find((item) => item.name === 'Config · Live demo mode')?.status, 'warn');
  });

  it('redacts OAuth and bearer secrets from diagnostics', () => {
    const redacted = redactError('Bearer abc.def refresh_token=secret-value client_secret:top-secret');
    assert.doesNotMatch(redacted, /abc\.def|secret-value|top-secret/);
    assert.match(redacted, /\[redacted\]/);
  });

  it('resolves the default memory path using the MCP workspace semantics', () => {
    const path = memoryPathForDoctor(undefined).replaceAll('\\', '/');
    assert.match(path, /jarvis-ops-agent\/\.jarvis\/memory\.json$/);
  });
});
