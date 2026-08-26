import type { SystemStatus, TraceItem } from '../types';

const SNAPSHOT_PREFIX = 'Get Repository Snapshot';
const PUBLISH_PREFIX = 'Publish Verified Fix';

export function githubSystemStatusFromTrace(item: TraceItem): SystemStatus | null {
  if (item.category !== 'tool') return null;

  const snapshot = item.title.startsWith(SNAPSHOT_PREFIX) || item.detail === 'Tool · get_repository_snapshot';
  const publication = item.title.startsWith(PUBLISH_PREFIX) || item.detail === 'Tool · publish_verified_fix';
  if (!snapshot && !publication) return null;

  if (item.state === 'error') {
    return {
      state: 'error',
      detail: item.detail || (snapshot ? 'Repository inspection failed' : 'Verified fix publication failed'),
    };
  }

  if (item.state === 'active' || item.state === 'waiting') {
    return {
      state: 'active',
      detail: snapshot ? 'Inspecting controlled demo repository' : 'Preparing verified fix publication',
    };
  }

  return {
    state: 'ready',
    detail: snapshot ? 'Repository snapshot available' : 'Verified fix publication completed',
  };
}

export function latestGithubSystemStatus(trace: TraceItem[]): SystemStatus | null {
  let latest: { timestamp: number; index: number; status: SystemStatus } | null = null;
  trace.forEach((item, index) => {
    const status = githubSystemStatusFromTrace(item);
    if (!status) return;
    if (
      !latest ||
      item.timestamp > latest.timestamp ||
      (item.timestamp === latest.timestamp && index > latest.index)
    ) {
      latest = { timestamp: item.timestamp, index, status };
    }
  });
  return latest?.status ?? null;
}
