import { describe, expect, it } from 'vitest';
import { normalizeOrchestratorHost } from './config.js';

describe('orchestrator host configuration', () => {
  it('defaults missing, blank and whitespace-only hosts to loopback', () => {
    expect(normalizeOrchestratorHost(undefined)).toBe('127.0.0.1');
    expect(normalizeOrchestratorHost('')).toBe('127.0.0.1');
    expect(normalizeOrchestratorHost('   ')).toBe('127.0.0.1');
  });

  it('trims an explicitly configured host', () => {
    expect(normalizeOrchestratorHost(' 127.0.0.1 ')).toBe('127.0.0.1');
    expect(normalizeOrchestratorHost(' 0.0.0.0 ')).toBe('0.0.0.0');
  });
});
