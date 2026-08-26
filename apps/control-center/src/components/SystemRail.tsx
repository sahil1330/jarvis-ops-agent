import { Box, CalendarDays, GitBranch, Mail, Radio, ShieldCheck } from 'lucide-react';
import { useLatencyTelemetry } from '../hooks/useLatencyTelemetry';
import { latestGithubSystemStatus } from '../lib/github-system-status';
import { formatLatency } from '../lib/latency';
import { readPausedCheckpoint } from '../lib/session-resume';
import type { Health, SystemState, SystemStatus, SystemStatuses } from '../types';

type Props = {
  health: Health | null;
  systems: SystemStatuses;
};

const stateLabels: Record<SystemState, string> = {
  unknown: 'Not checked',
  checking: 'Checking',
  offline: 'Unavailable',
  ready: 'Available',
  active: 'Working',
  error: 'Failed',
};

function StateIndicator({ status }: { status: SystemStatus }) {
  return (
    <span className={`system-status ${status.state}`} title={status.detail}>
      <i className="system-dot" aria-hidden="true" />
      <span>{stateLabels[status.state]}</span>
      <span className="sr-only">: {status.detail}</span>
    </span>
  );
}

export function SystemRail({ health, systems }: Props) {
  const latency = useLatencyTelemetry();
  const restoredGithub = systems.github.state === 'unknown'
    ? latestGithubSystemStatus(readPausedCheckpoint()?.trace ?? [])
    : null;
  const githubStatus = restoredGithub ?? systems.github;
  const hasLatency = (
    latency.sttMs !== undefined ||
    latency.firstAgentMs !== undefined ||
    latency.firstVoiceMs !== undefined ||
    latency.totalTurnMs !== undefined
  );
  const slowestTool = latency.tools.reduce<(typeof latency.tools)[number] | undefined>(
    (slowest, current) => !slowest || current.durationMs > slowest.durationMs ? current : slowest,
    undefined,
  );

  return (
    <aside className="system-rail" aria-label="Connected systems">
      <div className="rail-heading"><Radio size={14} /> SYSTEMS</div>
      <div className="system-list">
        <div><span className="system-icon"><ShieldCheck size={16} /></span><p><strong>TrueForge</strong><small>Agent harness</small></p><StateIndicator status={systems.harness} /></div>
        <div><span className="system-icon"><Mail size={16} /></span><p><strong>Gmail</strong><small>MCP connector</small></p><StateIndicator status={systems.gmail} /></div>
        <div><span className="system-icon"><CalendarDays size={16} /></span><p><strong>Calendar</strong><small>MCP connector</small></p><StateIndicator status={systems.calendar} /></div>
        <div><span className="system-icon"><GitBranch size={16} /></span><p><strong>GitHub</strong><small>Verified-fix MCP</small></p><StateIndicator status={githubStatus} /></div>
        <div><span className="system-icon"><Box size={16} /></span><p><strong>Sandbox</strong><small>Isolated compute</small></p><StateIndicator status={systems.sandbox} /></div>
      </div>
      <div className="safety-note">
        <ShieldCheck size={16} />
        <p><strong>Safety policy active</strong><span>External writes require your approval.</span></p>
      </div>
      <div className="rail-meta">
        <span>MODE</span><strong>{health ? (health.mode === 'demo' ? 'DEMO DATA' : 'LIVE ACCOUNT') : 'UNKNOWN'}</strong>
        <span>AGENT</span><strong>{health?.agent ?? (systems.harness.state === 'checking' ? 'checking…' : 'unavailable')}</strong>
        {hasLatency && (
          <>
            <span>STT</span><strong>{formatLatency(latency.sttMs)}</strong>
            <span>TEXT</span><strong>{formatLatency(latency.firstAgentMs)}</strong>
            <span>VOICE</span><strong>{formatLatency(latency.firstVoiceMs)}</strong>
            <span>TOTAL</span><strong>{formatLatency(latency.totalTurnMs)}</strong>
            {slowestTool && <><span>SLOW</span><strong title={slowestTool.label}>{formatLatency(slowestTool.durationMs)} · {slowestTool.label}</strong></>}
          </>
        )}
      </div>
    </aside>
  );
}
