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
  let latestStatus: SystemStatus | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestIndex = -1;

  for (let index = 0; index < trace.length; index += 1) {
    const item = trace[index];
    if (!item) continue;
    const status = githubSystemStatusFromTrace(item);
    if (!status) continue;
    if (item.timestamp > latestTimestamp || (item.timestamp === latestTimestamp && index > latestIndex)) {
      latestStatus = status;
      latestTimestamp = item.timestamp;
      latestIndex = index;
    }
  }

  return latestStatus;
}
