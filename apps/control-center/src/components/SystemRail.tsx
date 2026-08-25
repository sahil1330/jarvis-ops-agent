import { Box, CalendarDays, Mail, Radio, ShieldCheck } from 'lucide-react';
import type { Health, SystemState, SystemStatus, SystemStatuses } from '../types';

type Props = {
  health: Health | null;
  systems: SystemStatuses;
};

const stateLabels: Record<SystemState, string> = {
  unknown: 'Not checked',
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
  return (
    <aside className="system-rail" aria-label="Connected systems">
      <div className="rail-heading"><Radio size={14} /> SYSTEMS</div>
      <div className="system-list">
        <div><span className="system-icon"><ShieldCheck size={16} /></span><p><strong>TrueForge</strong><small>Agent harness</small></p><StateIndicator status={systems.harness} /></div>
        <div><span className="system-icon"><Mail size={16} /></span><p><strong>Gmail</strong><small>MCP connector</small></p><StateIndicator status={systems.gmail} /></div>
        <div><span className="system-icon"><CalendarDays size={16} /></span><p><strong>Calendar</strong><small>MCP connector</small></p><StateIndicator status={systems.calendar} /></div>
        <div><span className="system-icon"><Box size={16} /></span><p><strong>Sandbox</strong><small>Isolated compute</small></p><StateIndicator status={systems.sandbox} /></div>
      </div>
      <div className="safety-note">
        <ShieldCheck size={16} />
        <p><strong>Safety policy active</strong><span>External writes require your approval.</span></p>
      </div>
      <div className="rail-meta">
        <span>MODE</span><strong>{health ? (health.mode === 'demo' ? 'DEMO DATA' : 'LIVE ACCOUNT') : 'UNKNOWN'}</strong>
        <span>AGENT</span><strong>{health?.agent ?? (systems.harness.state === 'unknown' ? 'checking…' : 'unavailable')}</strong>
      </div>
    </aside>
  );
}
