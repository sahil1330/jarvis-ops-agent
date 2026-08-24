import { Box, CalendarDays, Mail, Radio, ShieldCheck } from 'lucide-react';
import type { Health, SystemState } from '../types';

type Props = {
  health: Health | null;
  phase: 'idle' | 'running' | 'paused' | 'done' | 'error';
};

function StateDot({ state }: { state: SystemState }) {
  return <i className={`system-dot ${state}`} aria-hidden="true" />;
}

export function SystemRail({ health, phase }: Props) {
  const harnessReady = health?.harness.connected ?? false;
  const active = phase === 'running';

  return (
    <aside className="system-rail" aria-label="Connected systems">
      <div className="rail-heading"><Radio size={14} /> SYSTEMS</div>
      <div className="system-list">
        <div><span className="system-icon"><ShieldCheck size={16} /></span><p><strong>TrueForge</strong><small>Agent harness</small></p><StateDot state={active ? 'active' : harnessReady ? 'ready' : 'offline'} /></div>
        <div><span className="system-icon"><Mail size={16} /></span><p><strong>Gmail</strong><small>MCP connector</small></p><StateDot state={harnessReady ? 'ready' : 'offline'} /></div>
        <div><span className="system-icon"><CalendarDays size={16} /></span><p><strong>Calendar</strong><small>MCP connector</small></p><StateDot state={harnessReady ? 'ready' : 'offline'} /></div>
        <div><span className="system-icon"><Box size={16} /></span><p><strong>Sandbox</strong><small>Isolated compute</small></p><StateDot state={active ? 'active' : harnessReady ? 'ready' : 'offline'} /></div>
      </div>
      <div className="safety-note">
        <ShieldCheck size={16} />
        <p><strong>Safety policy active</strong><span>External writes require your approval.</span></p>
      </div>
      <div className="rail-meta">
        <span>MODE</span><strong>{health?.mode === 'demo' ? 'DEMO DATA' : 'LIVE ACCOUNT'}</strong>
        <span>AGENT</span><strong>{health?.agent ?? 'checking…'}</strong>
      </div>
    </aside>
  );
}
