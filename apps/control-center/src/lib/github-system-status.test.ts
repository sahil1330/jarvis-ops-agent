import { describe, expect, it } from 'vitest';
import { githubSystemStatusFromTrace, latestGithubSystemStatus } from './github-system-status';
import type { TraceItem } from '../types';

function trace(title: string, state: TraceItem['state'], detail?: string, timestamp = 1): TraceItem {
  return { id: title, category: 'tool', title, state, ...(detail ? { detail } : {}), timestamp };
}

describe('GitHub system status from TrueForge trace', () => {
  it('maps repository inspection lifecycle exactly', () => {
    expect(githubSystemStatusFromTrace(trace('Get Repository Snapshot in progress', 'active'))?.state).toBe('active');
    expect(githubSystemStatusFromTrace(trace('Get Repository Snapshot completed', 'done', 'Tool · get_repository_snapshot'))?.state).toBe('ready');
    expect(githubSystemStatusFromTrace(trace('Get Repository Snapshot failed', 'error', 'GitHub API 403'))).toEqual({
      state: 'error',
      detail: 'GitHub API 403',
    });
  });

  it('maps verified-fix publication lifecycle and ignores unrelated tools', () => {
    expect(githubSystemStatusFromTrace(trace('Publish Verified Fix in progress', 'active'))?.state).toBe('active');
    expect(githubSystemStatusFromTrace(trace('Publish Verified Fix completed', 'done', 'Tool · publish_verified_fix'))?.state).toBe('ready');
    expect(githubSystemStatusFromTrace(trace('Search Emails completed', 'done', 'Tool · search_emails'))).toBeNull();
  });

  it('restores the chronologically newest GitHub state even when trace insertion order is older', () => {
    const items = [
      trace('Get Repository Snapshot failed', 'error', 'latest failure', 30),
      trace('Publish Verified Fix in progress', 'active', undefined, 20),
    ];
    expect(latestGithubSystemStatus(items)).toEqual({ state: 'error', detail: 'latest failure' });
  });

  it('uses later array position only as a tie breaker for equal timestamps', () => {
    const items = [
      trace('Get Repository Snapshot completed', 'done', 'Tool · get_repository_snapshot', 40),
      trace('Publish Verified Fix in progress', 'active', undefined, 40),
    ];
    expect(latestGithubSystemStatus(items)?.state).toBe('active');
  });
});
