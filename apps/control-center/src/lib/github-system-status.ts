import type { SystemStatus, TraceItem } from '../types';

const GITHUB_OPERATIONS = [
  ['get_repository_snapshot', 'Get Repository Snapshot'],
  ['read_repository_file', 'Read Repository File'],
  ['list_pull_requests', 'List Pull Requests'],
  ['get_pull_request', 'Get Pull Request'],
  ['list_pull_request_files', 'List Pull Request Files'],
  ['list_pull_request_reviews', 'List Pull Request Reviews'],
  ['update_pull_request', 'Update Pull Request'],
  ['request_pull_request_reviewers', 'Request Pull Request Reviewers'],
  ['submit_pull_request_review', 'Submit Pull Request Review'],
  ['list_workflows', 'List Workflows'],
  ['list_workflow_runs', 'List Workflow Runs'],
  ['get_workflow_run', 'Get Workflow Run'],
  ['dispatch_workflow', 'Dispatch Workflow'],
  ['rerun_workflow_run', 'Rerun Workflow Run'],
  ['cancel_workflow_run', 'Cancel Workflow Run'],
  ['list_environments', 'List Environments'],
  ['get_environment', 'Get Environment'],
  ['configure_environment', 'Configure Environment'],
  ['list_agent_tasks', 'List Agent Tasks'],
  ['get_agent_task', 'Get Agent Task'],
  ['start_agent_task', 'Start Agent Task'],
  ['publish_verified_fix', 'Publish Verified Fix'],
] as const;

export function githubSystemStatusFromTrace(item: TraceItem): SystemStatus | null {
  if (item.category !== 'tool') return null;

  const operation = GITHUB_OPERATIONS.find(([name, title]) => (
    item.title.startsWith(title) || item.detail === `Tool · ${name}`
  ));
  if (!operation) return null;

  const [name, title] = operation;
  const snapshot = name === 'get_repository_snapshot';
  const publication = name === 'publish_verified_fix';

  if (item.state === 'error') {
    return {
      state: 'error',
      detail: item.detail || (snapshot
        ? 'Repository inspection failed'
        : publication
          ? 'Verified fix publication failed'
          : `${title} failed`),
    };
  }

  if (item.state === 'active' || item.state === 'waiting') {
    return {
      state: 'active',
      detail: snapshot
        ? 'Inspecting controlled demo repository'
        : publication
          ? 'Preparing verified fix publication'
          : `${title} in progress`,
    };
  }

  return {
    state: 'ready',
    detail: snapshot
      ? 'Repository snapshot available'
      : publication
        ? 'Verified fix publication completed'
        : `${title} completed`,
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
