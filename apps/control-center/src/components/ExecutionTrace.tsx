import { AlertCircle, Bot, Box, Check, CircleDashed, PlugZap, Shield, Wrench } from 'lucide-react';
import type { AgentPhase, TraceItem } from '../types';
import './mission-control.css';

const icons = {
  harness: Shield,
  connector: PlugZap,
  sandbox: Box,
  subagent: Bot,
  tool: Wrench,
};

const phaseLabels: Record<AgentPhase, string> = {
  idle: 'ready',
  running: 'streaming',
  paused: 'approval needed',
  done: 'complete',
  error: 'stopped',
};

const stateLabels: Record<TraceItem['state'], string> = {
  active: 'In progress',
  done: 'Completed',
  waiting: 'Waiting',
  error: 'Failed',
};

type MissionStage = {
  id: 'context' | 'requirements' | 'verify' | 'action';
  label: string;
  hint: string;
  matches: (item: TraceItem) => boolean;
};

const missionStages: MissionStage[] = [
  {
    id: 'context',
    label: 'Context',
    hint: 'Meeting and deadline',
    matches: (item) => /calendar|meeting|schedule/i.test(`${item.title} ${item.detail ?? ''}`),
  },
  {
    id: 'requirements',
    label: 'Requirements',
    hint: 'Client evidence',
    matches: (item) => /gmail|inbox|email|thread/i.test(`${item.title} ${item.detail ?? ''}`),
  },
  {
    id: 'verify',
    label: 'Verify',
    hint: 'Repository + sandbox',
    matches: (item) => item.category === 'sandbox' || /repository|github|test|verification|engineering/i.test(`${item.title} ${item.detail ?? ''}`),
  },
  {
    id: 'action',
    label: 'Action',
    hint: 'Human-controlled write',
    matches: (item) => /publish|pull request|approval|send|move calendar/i.test(`${item.title} ${item.detail ?? ''}`),
  },
];

type StageState = 'pending' | 'active' | 'done' | 'error';

export function deriveMissionStageState(stage: MissionStage, items: TraceItem[], phase: AgentPhase): StageState {
  const matching = items.filter(stage.matches);
  if (stage.id === 'action' && phase === 'paused') return 'active';
  if (matching.some((item) => item.state === 'error')) return 'error';
  if (matching.some((item) => item.state === 'active' || item.state === 'waiting')) return 'active';
  if (matching.some((item) => item.state === 'done')) return 'done';
  return 'pending';
}

function MissionProgress({ items, phase }: { items: TraceItem[]; phase: AgentPhase }) {
  if (items.length === 0 && phase === 'idle') return null;

  return (
    <div className="mission-progress" aria-label="Mission progress">
      <div className="mission-progress-heading">
        <span>MISSION</span>
        <strong>Prepare for the objective</strong>
      </div>
      <ol>
        {missionStages.map((stage) => {
          const state = deriveMissionStageState(stage, items, phase);
          return (
            <li key={stage.id} className={`mission-stage stage-${state}`}>
              <span className="mission-stage-marker" aria-hidden="true">
                {state === 'done' ? <Check size={13} /> : state === 'error' ? <AlertCircle size={13} /> : null}
              </span>
              <span className="mission-stage-copy">
                <strong>{stage.label}</strong>
                <small>{stage.hint}</small>
              </span>
              <span className="mission-stage-state">{state}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ExecutionTrace({ items, phase }: { items: TraceItem[]; phase: AgentPhase }) {
  return (
    <section className="trace-panel" aria-labelledby="trace-title">
      <div className="section-heading">
        <div>
          <span>LIVE EXECUTION</span>
          <h2 id="trace-title">Agent trace</h2>
        </div>
        <div className={`live-indicator phase-${phase}`} role="status" aria-live="polite">
          <i aria-hidden="true" /> {phaseLabels[phase]}
        </div>
      </div>

      <MissionProgress items={items} phase={phase} />

      <div className="technical-trace-label"><span>TECHNICAL EVIDENCE</span><span>TrueForge events</span></div>
      <div className="trace-list" aria-live="polite" aria-relevant="additions text" aria-busy={phase === 'running'}>
        {items.length === 0 ? (
          <div className="trace-empty">
            <CircleDashed size={30} />
            <p>The harness trace will appear here.</p>
            <span>MCP calls, subagents, sandbox execution and approvals remain visible.</span>
          </div>
        ) : (
          items.map((item) => {
            const Icon = icons[item.category];
            return (
              <article className={`trace-item state-${item.state}`} key={item.id}>
                <div className="trace-icon"><Icon size={16} /></div>
                <div className="trace-copy">
                  <strong>{item.title}</strong>
                  {item.detail && <p>{item.detail}</p>}
                </div>
                <div className="trace-state">
                  <span className="sr-only">{stateLabels[item.state]}</span>
                  {item.state === 'done'
                    ? <Check size={14} aria-hidden="true" />
                    : item.state === 'error'
                      ? <AlertCircle size={15} aria-hidden="true" />
                      : <span className="trace-pulse" aria-hidden="true" />}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
