import { useEffect, useRef, type RefObject } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, MessageSquareText, Volume2, VolumeX } from 'lucide-react';
import { useSpeechOutput } from '../hooks/useSpeechOutput';
import type { AgentPhase, ApprovalCall, OperationNotice } from '../types';
import { ApprovalCard } from './ApprovalCard';

type Props = {
  panelRef: RefObject<HTMLElement | null>;
  phase: AgentPhase;
  response: string;
  notices: OperationNotice[];
  approvals: ApprovalCall[];
  error: string;
  metrics: { totalTokens?: number; totalCostUsd?: number };
  onDecision: (status: 'allow' | 'deny') => void;
};

const phaseLabels: Record<AgentPhase, string> = {
  idle: 'Ready',
  running: 'Working',
  paused: 'Approval needed',
  done: 'Complete',
  error: 'Action needed',
};

function OutcomeHeading({ phase, hasResponse, hasIssues }: { phase: AgentPhase; hasResponse: boolean; hasIssues: boolean }) {
  if (phase === 'error') return <>Jarvis needs your attention</>;
  if (phase === 'paused') return <>Review before Jarvis continues</>;
  if (hasIssues && phase === 'done') return <>Completed with an issue</>;
  if (hasIssues) return <>A connected tool needs attention</>;
  if (phase === 'done') return <>Task complete</>;
  if (phase === 'running' && hasResponse) return <>Jarvis is responding</>;
  if (phase === 'running') return <>Jarvis is working</>;
  return <>Your result will appear here</>;
}

function approvalSummary(calls: ApprovalCall[]): string {
  const labels = calls.map((call) => call.toolName.includes('email') ? 'send an email' : call.toolName.includes('calendar') ? 'change your calendar' : call.toolName.replaceAll('_', ' '));
  return `I need your approval before I ${labels.join(' and ')}. Please review the exact action on screen.`;
}

export function OutcomePanel({
  panelRef,
  phase,
  response,
  notices,
  approvals,
  error,
  metrics,
  onDecision,
}: Props) {
  const hasFeedback = response.length > 0 || notices.length > 0 || approvals.length > 0 || error.length > 0;
  const hasIssues = notices.some((notice) => notice.severity === 'error');
  const attentionTarget = useRef<HTMLDivElement | null>(null);
  const attentionKey = error ? `fatal:${error}` : notices.at(-1)?.id;
  const voice = useSpeechOutput(true);

  useEffect(() => {
    if (attentionKey) attentionTarget.current?.focus({ preventScroll: true });
  }, [attentionKey]);

  useEffect(() => {
    if (phase === 'paused' && approvals.length > 0) {
      void voice.speak(response || approvalSummary(approvals));
      return;
    }
    if (phase === 'done' && response) {
      void voice.speak(response);
      return;
    }
    if (phase === 'error' && error) void voice.speak(`I need your attention. ${error}`);
  }, [approvals, error, phase, response, voice.speak]);

  return (
    <section className={`outcome-panel phase-${phase}${hasIssues ? ' has-issues' : ''}`} aria-labelledby="outcome-title" ref={panelRef}>
      <div className="outcome-heading">
        <div>
          <span>LIVE OUTCOME</span>
          <h2 id="outcome-title"><OutcomeHeading phase={phase} hasResponse={response.length > 0} hasIssues={hasIssues} /></h2>
        </div>
        <div className={`outcome-phase phase-${phase}${hasIssues ? ' has-issues' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          {phase === 'running' ? <LoaderCircle size={13} aria-hidden="true" /> : <i aria-hidden="true" />}
          {hasIssues && phase === 'done' ? 'Issues found' : phaseLabels[phase]}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={voice.toggle}
          aria-pressed={voice.enabled}
          aria-label={voice.enabled ? 'Mute Jarvis voice' : 'Enable Jarvis voice'}
          title={voice.enabled ? 'Jarvis voice on' : 'Jarvis voice muted'}
        >
          {voice.enabled ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
        </button>
      </div>

      <div className="outcome-body">
        {notices.map((notice) => (
          <div
            className={`operation-notice severity-${notice.severity}`}
            key={notice.id}
            role="alert"
            tabIndex={-1}
            data-outcome-alert
            ref={!error && notice.id === notices.at(-1)?.id ? attentionTarget : undefined}
          >
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
              {notice.system && <small>{notice.system.toUpperCase()} · Jarvis can continue, but this tool did not succeed.</small>}
            </div>
          </div>
        ))}

        {error && (
          <div className="operation-notice severity-error" role="alert" tabIndex={-1} data-outcome-alert ref={attentionTarget}>
            <AlertTriangle size={18} aria-hidden="true" />
            <div><strong>Jarvis could not continue</strong><p>{error}</p></div>
          </div>
        )}

        {response && (
          <div className="agent-response" role="log" aria-live="polite" aria-relevant="additions text">
            <div className="response-label"><i aria-hidden="true" /> JARVIS RESPONSE</div>
            <p>{response}</p>
            {(metrics.totalTokens !== undefined || metrics.totalCostUsd !== undefined) && (
              <small>{metrics.totalTokens?.toLocaleString() ?? '—'} tokens · ${metrics.totalCostUsd?.toFixed(4) ?? '—'}</small>
            )}
          </div>
        )}

        {approvals.length > 0 && <ApprovalCard calls={approvals} busy={phase === 'running'} onDecision={onDecision} />}

        {!hasFeedback && (
          <div className={`outcome-empty phase-${phase}`}>
            {phase === 'running' ? <LoaderCircle size={24} aria-hidden="true" /> : phase === 'done' ? <CheckCircle2 size={24} aria-hidden="true" /> : <MessageSquareText size={24} aria-hidden="true" />}
            <p>{phase === 'running' ? 'Checking the harness and connected tools…' : 'Run a command to see progress, tool failures and the final response here.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
