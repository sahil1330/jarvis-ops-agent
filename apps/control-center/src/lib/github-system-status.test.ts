import { describe, expect, it } from 'vitest';
import { githubSystemStatusFromTrace, latestGithubSystemStatus } from './github-system-status';
import type { TraceItem } from '../types';

function trace(title: string, state: TraceItem['state'], detail?: string): TraceItem {
  return { id: title, category: 'tool', title, state, ...(detail ? { detail } : {}), timestamp: 1 };
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

  it('restores the most recent GitHub state from a persisted trace', () => {
    const items = [
      trace('Get Repository Snapshot completed', 'done', 'Tool · get_repository_snapshot'),
      trace('Publish Verified Fix in progress', 'active'),
    ];
    expect(latestGithubSystemStatus(items)?.state).toBe('active');
  });
});
