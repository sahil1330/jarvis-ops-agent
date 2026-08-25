import { describe, expect, it } from 'vitest';
import { bearerTokenMatches } from './auth.js';

describe('MCP bearer authentication', () => {
  const token = 'a-secure-token-that-is-at-least-32-characters';

  it('accepts only the exact bearer token', () => {
    expect(bearerTokenMatches(`Bearer ${token}`, token)).toBe(true);
    expect(bearerTokenMatches('Bearer wrong-token', token)).toBe(false);
    expect(bearerTokenMatches(undefined, token)).toBe(false);
  });
});
