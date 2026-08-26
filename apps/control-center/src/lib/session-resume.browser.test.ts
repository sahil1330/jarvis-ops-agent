// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { clearPausedCheckpoint, clearResumableSession, persistSessionId, readPausedCheckpoint, readSessionId } from './session-resume';

describe('session storage availability', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(window, 'sessionStorage', originalDescriptor);
  });

  it('treats a throwing sessionStorage getter as unavailable for every best-effort operation', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });

    expect(() => persistSessionId('session-1')).not.toThrow();
    expect(readSessionId()).toBeNull();
    expect(readPausedCheckpoint()).toBeNull();
    expect(() => clearPausedCheckpoint()).not.toThrow();
    expect(() => clearResumableSession()).not.toThrow();
  });
});
