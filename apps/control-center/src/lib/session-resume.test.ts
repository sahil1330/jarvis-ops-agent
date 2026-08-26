import { describe, expect, it } from 'vitest';
import { clearResumableSession, persistPausedCheckpoint, persistSessionId, readPausedCheckpoint, readSessionId } from './session-resume';

const CHECKPOINT_KEY = 'jarvis.trueforge.paused-checkpoint';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('resumable TrueForge session state', () => {
  it('persists the session id and exact paused approval checkpoint', () => {
    const storage = memoryStorage();
    persistSessionId('session-123', storage);
    persistPausedCheckpoint({
      sessionId: 'session-123',
      response: 'Verified fix ready.',
      approvals: [{ threadId: 'main', toolCallId: 'call-1', toolName: 'publish_verified_fix', arguments: '{"baseSha":"abc"}' }],
      trace: [{ id: 'tool:1', category: 'tool', title: 'Publish verified fix', state: 'waiting', timestamp: 1 }],
    }, storage);

    expect(readSessionId(storage)).toBe('session-123');
    expect(readPausedCheckpoint(storage)?.approvals[0]?.toolName).toBe('publish_verified_fix');
  });

  it('rejects and removes malformed approval entries from storage', () => {
    const storage = memoryStorage();
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({
      sessionId: 'session-123',
      response: 'Approval pending',
      approvals: [{ threadId: 'main', toolCallId: 'call-1', toolName: 42, arguments: '{}' }],
      trace: [],
    }));

    expect(readPausedCheckpoint(storage)).toBeNull();
    expect(storage.getItem(CHECKPOINT_KEY)).toBeNull();
  });

  it('rejects malformed trace entries instead of restoring unsafe UI state', () => {
    const storage = memoryStorage();
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({
      sessionId: 'session-123',
      response: 'Approval pending',
      approvals: [{ threadId: 'main', toolCallId: 'call-1', toolName: 'send_email', arguments: '{}' }],
      trace: [{ id: 'trace-1', category: 'not-a-category', title: 'Bad trace', state: 'waiting', timestamp: 1 }],
    }));

    expect(readPausedCheckpoint(storage)).toBeNull();
    expect(storage.getItem(CHECKPOINT_KEY)).toBeNull();
  });

  it('clears both identifiers on New Session', () => {
    const storage = memoryStorage();
    persistSessionId('session-123', storage);
    persistPausedCheckpoint({ sessionId: 'session-123', response: '', approvals: [{ threadId: 'main', toolCallId: 'call-1', toolName: 'send_email', arguments: '{}' }], trace: [] }, storage);
    clearResumableSession(storage);
    expect(readSessionId(storage)).toBeNull();
    expect(readPausedCheckpoint(storage)).toBeNull();
  });
});
