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
  paused: 'human checkpoint',
  done: 'complete',
  error: 'stopped',
};

const stateLabels: Record<TraceItem['state'], string> = {
  active: 'In progress',
  done: 'Completed',
  waiting: 'Waiting',
  error: 'Failed',
};

type MissionStageId = 'context' | 'requirements' | 'verify' | 'action';
type MissionStage = {
  id: MissionStageId;
  label: string;
  hint: string;
  matches: (item: TraceItem) => boolean;
};

type StageState = 'pending' | 'active' | 'done' | 'error';

function text(item: TraceItem): string {
  return `${item.title}\n${item.detail ?? ''}`;
}

function isCalendarRead(item: TraceItem): boolean {
  return /^(Checking Google Calendar|Calendar check (?:completed|failed))$/.test(item.title)
    || item.detail === 'Tool · list_calendar_events';
}

function isRequirementRead(item: TraceItem): boolean {
  return /^(Searching Gmail|Gmail search (?:completed|failed)|Get Email Thread (?:in progress|completed|failed))$/.test(item.title)
    || item.detail === 'Tool · search_emails'
    || item.detail === 'Tool · get_email_thread';
}

function isRepositoryRead(item: TraceItem): boolean {
  return /^Get Repository Snapshot (?:in progress|completed|failed)$/.test(item.title)
    || item.detail === 'Tool · get_repository_snapshot';
}

function isExternalAction(item: TraceItem): boolean {
  return /^(Preparing Gmail action|Gmail action (?:completed|failed)|Preparing calendar change|Calendar change (?:completed|failed)|Publish Verified Fix (?:in progress|completed|failed))$/.test(item.title)
    || item.detail === 'Tool · send_email'
    || item.detail === 'Tool · move_calendar_event'
    || item.detail === 'Tool · publish_verified_fix';
}

const missionStages: MissionStage[] = [
  { id: 'context', label: 'Context', hint: 'Meeting and deadline', matches: isCalendarRead },
  { id: 'requirements', label: 'Requirements', hint: 'Client evidence', matches: isRequirementRead },
  { id: 'verify', label: 'Verify', hint: 'Repository + sandbox evidence', matches: isRepositoryRead },
  { id: 'action', label: 'Action', hint: 'Human-controlled write', matches: isExternalAction },
];

function genericStageState(stage: MissionStage, items: TraceItem[]): StageState {
  const matching = items.filter(stage.matches);
  if (matching.some((item) => item.state === 'error')) return 'error';
  if (matching.some((item) => item.state === 'active' || item.state === 'waiting')) return 'active';
  if (matching.some((item) => item.state === 'done')) return 'done';
  return 'pending';
}

export function deriveMissionStageState(stage: MissionStage, items: TraceItem[], phase: AgentPhase): StageState {
  if (stage.id === 'action') {
    if (phase === 'paused') return 'active';
    return genericStageState(stage, items);
  }

  if (stage.id !== 'verify') return genericStageState(stage, items);

  const repository = items.filter(isRepositoryRead);
  if (repository.some((item) => item.state === 'error')) return 'error';

  const repositoryDone = repository.some((item) => item.state === 'done');
  const repositoryWorking = repository.some((item) => item.state === 'active' || item.state === 'waiting');
  const sandboxProvisioned = items.some(
    (item) => item.category === 'sandbox' && item.title === 'Isolated sandbox provisioned' && item.state === 'done',
  );
  const actionStarted = items.some(isExternalAction) || phase === 'paused';

  // Sandbox allocation is infrastructure evidence, not successful verification. The stage becomes
  // complete only once repository evidence + sandbox use exist and execution has advanced to the
  // approval-gated action phase, which the agent contract permits only after targeted verification.
  if (repositoryDone && sandboxProvisioned && actionStarted) return 'done';
  if (repositoryWorking || repositoryDone || sandboxProvisioned) return 'active';
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
