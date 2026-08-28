import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, MessageSquareText, Volume2, VolumeX } from 'lucide-react';
import { useConversationalReveal } from '../hooks/useConversationalReveal';
import { useSpeechOutput } from '../hooks/useSpeechOutput';
import { markFirstVoiceStart } from '../lib/latency';
import { consumeSpeechSegments } from '../lib/speech-segments';
import type { AgentPhase, ApprovalCall, CheckpointVoiceControl, OperationNotice, ProgressNarration, UserInputRequest } from '../types';
import { ApprovalCard } from './ApprovalCard';
import { MarkdownMessage } from './MarkdownMessage';
import { UserInputCard } from './UserInputCard';

type Props = {
  panelRef: RefObject<HTMLElement | null>;
  phase: AgentPhase;
  response: string;
  narrations: ProgressNarration[];
  notices: OperationNotice[];
  approvals: ApprovalCall[];
  inputRequests: UserInputRequest[];
  checkpointVoice: CheckpointVoiceControl;
  error: string;
  metrics: { totalTokens?: number; totalCostUsd?: number };
  realtimeVoiceAvailable: boolean;
  neuralTtsAvailable: boolean;
  onDecision: (status: 'allow' | 'deny') => void;
  onInputSubmit: (answers: Array<{ toolCallId: string; content: string }>) => void;
};

const phaseLabels: Record<AgentPhase, string> = {
  idle: 'Ready',
  running: 'Working',
  paused: 'Approval needed',
  done: 'Complete',
  error: 'Action needed',
};

const STREAM_IDLE_FLUSH_MS = 750;
const MIN_IDLE_FLUSH_CHARACTERS = 24;
const RESPONSE_OVERLAP_ANCHOR = 256;

function OutcomeHeading({ phase, hasResponse, hasIssues, inputPending }: { phase: AgentPhase; hasResponse: boolean; hasIssues: boolean; inputPending: boolean }) {
  if (phase === 'error') return <>Jarvis needs your attention</>;
  if (phase === 'paused') return inputPending ? <>Answer so Jarvis can continue</> : <>Review before Jarvis continues</>;
  if (hasIssues && phase === 'done') return <>Completed with an issue</>;
  if (hasIssues) return <>A connected tool needs attention</>;
  if (phase === 'done') return <>Task complete</>;
  if (phase === 'running' && hasResponse) return <>Jarvis is responding</>;
  if (phase === 'running') return <>Jarvis is working</>;
  return <>Your result will appear here</>;
}

function approvalSummary(calls: ApprovalCall[]): string {
  const labels = calls.map((call) => call.toolName.includes('email') ? 'send an email' : call.toolName.includes('calendar') ? 'change your calendar' : call.toolName.replaceAll('_', ' '));
  return `I need your approval before I ${labels.join(' and ')}. Review the action, then say “approve it” or “deny it”, or use the buttons.`;
}

function inputRequestSummary(requests: UserInputRequest[]): string {
  const first = requests[0];
  if (!first) return '';
  const instruction = first.options.length > 0
    ? 'Choose on screen, or tap reply by voice and say an option or answer naturally.'
    : 'Type on screen, or tap reply by voice and answer naturally.';
  return `I need your input before I can continue. ${first.question} ${instruction}`;
}

function rollingAppend(previous: string, current: string): { incoming: string; reset: boolean } {
  if (!previous) return { incoming: current, reset: false };
  if (current.startsWith(previous)) return { incoming: current.slice(previous.length), reset: false };
  if (!current) return { incoming: '', reset: true };

  const anchorLength = Math.min(RESPONSE_OVERLAP_ANCHOR, previous.length, current.length);
  const anchor = current.slice(0, anchorLength);
  let candidate = previous.lastIndexOf(anchor);
  while (candidate > 0) {
    const retained = previous.slice(candidate);
    if (current.startsWith(retained)) {
      return { incoming: current.slice(retained.length), reset: false };
    }
    candidate = previous.lastIndexOf(anchor, candidate - 1);
  }

  return { incoming: current, reset: true };
}

export function OutcomePanel({
  panelRef,
  phase,
  response,
  narrations,
  notices,
  approvals,
  inputRequests,
  checkpointVoice,
  error,
  metrics,
  realtimeVoiceAvailable,
  neuralTtsAvailable,
  onDecision,
  onInputSubmit,
}: Props) {
  const hasFeedback = response.length > 0 || narrations.length > 0 || notices.length > 0 || approvals.length > 0 || inputRequests.length > 0 || error.length > 0;
  const hasIssues = notices.some((notice) => notice.severity === 'error');
  const attentionTarget = useRef<HTMLDivElement | null>(null);
  const attentionKey = error ? `fatal:${error}` : notices.at(-1)?.id;
  const spokenResponseSnapshot = useRef('');
  const spokenNarrationIds = useRef(new Set<string>());
  const spokenCheckpointKey = useRef('');
  const pendingSpeech = useRef('');
  const voice = useSpeechOutput(realtimeVoiceAvailable, neuralTtsAvailable);
  const revealedResponse = useConversationalReveal(response, phase === 'running');
  const latestNarration = narrations.at(-1);

  const enqueueSpeech = useCallback((content: string) => {
    markFirstVoiceStart();
    voice.enqueue(content);
  }, [voice.enqueue]);

  const speakNow = useCallback((content: string) => {
    markFirstVoiceStart();
    voice.speakNow(content);
  }, [voice.speakNow]);

  const flushPendingSpeech = useCallback(() => {
    const flushed = consumeSpeechSegments(pendingSpeech.current, '', true);
    pendingSpeech.current = flushed.rest;
    for (const segment of flushed.segments) enqueueSpeech(segment);
    return flushed.segments.length;
  }, [enqueueSpeech]);

  useEffect(() => {
    if (attentionKey) attentionTarget.current?.focus({ preventScroll: true });
  }, [attentionKey]);

  useEffect(() => {
    const previous = spokenResponseSnapshot.current;
    const { incoming, reset } = rollingAppend(previous, response);
    spokenResponseSnapshot.current = response;

    if (reset) {
      voice.stop();
      pendingSpeech.current = '';
    }
    if (!incoming) return;

    const next = consumeSpeechSegments(pendingSpeech.current, incoming);
    pendingSpeech.current = next.rest;
    for (const segment of next.segments) enqueueSpeech(segment);
  }, [enqueueSpeech, response, voice.stop]);

  useEffect(() => {
    for (const narration of narrations) {
      if (spokenNarrationIds.current.has(narration.id)) continue;
      spokenNarrationIds.current.add(narration.id);
      if (narration.interrupt) speakNow(narration.content);
      else enqueueSpeech(narration.content);
    }
  }, [enqueueSpeech, narrations, speakNow]);

  useEffect(() => {
    if (phase !== 'running' || pendingSpeech.current.trim().length < MIN_IDLE_FLUSH_CHARACTERS) return;
    const timer = window.setTimeout(flushPendingSpeech, STREAM_IDLE_FLUSH_MS);
    return () => window.clearTimeout(timer);
  }, [flushPendingSpeech, phase, response]);

  useEffect(() => {
    if (phase === 'idle') {
      voice.stop();
      spokenResponseSnapshot.current = '';
      spokenNarrationIds.current.clear();
      spokenCheckpointKey.current = '';
      pendingSpeech.current = '';
      return;
    }

    if (phase === 'paused' || phase === 'done') {
      flushPendingSpeech();
      if (phase === 'paused') {
        const checkpointKey = approvals.length > 0
          ? `approval:${approvals.map((call) => call.toolCallId).join('|')}`
          : inputRequests.length > 0
            ? `input:${inputRequests.map((request) => request.toolCallId).join('|')}`
            : '';
        if (checkpointKey && checkpointKey !== spokenCheckpointKey.current) {
          spokenCheckpointKey.current = checkpointKey;
          speakNow(approvals.length > 0 ? approvalSummary(approvals) : inputRequestSummary(inputRequests));
        }
      }
      return;
    }

    if (phase === 'error' && error) {
      pendingSpeech.current = '';
      speakNow(`I need your attention. ${error}`);
    }
  }, [approvals, error, flushPendingSpeech, inputRequests, phase, speakNow, voice.stop]);

  const phaseLabel = phase === 'paused' && inputRequests.length > 0 ? 'Input needed' : phaseLabels[phase];

  const voiceLabel = voice.mode === 'realtime'
    ? 'Realtime natural voice'
    : voice.mode === 'neural'
      ? 'Neural voice fallback'
      : 'Browser voice fallback';

  return (
    <section className={`outcome-panel phase-${phase}${hasIssues ? ' has-issues' : ''}`} aria-labelledby="outcome-title" ref={panelRef}>
      <div className="outcome-heading">
        <div>
          <span>LIVE OUTCOME</span>
          <h2 id="outcome-title"><OutcomeHeading phase={phase} hasResponse={response.length > 0} hasIssues={hasIssues} inputPending={inputRequests.length > 0} /></h2>
        </div>
        <div className={`outcome-phase phase-${phase}${hasIssues ? ' has-issues' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          {phase === 'running' ? <LoaderCircle size={13} aria-hidden="true" /> : <i aria-hidden="true" />}
          {hasIssues && phase === 'done' ? 'Issues found' : phaseLabel}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={voice.toggle}
          aria-pressed={voice.enabled}
          aria-label={voice.enabled ? 'Mute Jarvis voice' : 'Enable Jarvis voice'}
          title={voice.enabled ? `${voiceLabel}${voice.speaking ? ' · speaking' : ''}` : 'Jarvis voice muted'}
        >
          {voice.enabled ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
        </button>
      </div>

      <div className="outcome-body">
        {phase === 'running' && latestNarration && (
          <div className="progress-narration" role="status" aria-live="polite" aria-atomic="true">
            <span>JARVIS · NOW</span>
            <p>{latestNarration.content}</p>
          </div>
        )}

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
          <div className="agent-response">
            <div className="response-label"><i aria-hidden="true" /> JARVIS RESPONSE</div>
            <span className="sr-only">Jarvis response: {response}</span>
            <MarkdownMessage
              content={revealedResponse}
              streaming={revealedResponse.length < response.length}
            />
            {(metrics.totalTokens !== undefined || metrics.totalCostUsd !== undefined) && (
              <small>{metrics.totalTokens?.toLocaleString() ?? '—'} tokens · ${metrics.totalCostUsd?.toFixed(4) ?? '—'}</small>
            )}
          </div>
        )}

        {approvals.length > 0 && <ApprovalCard calls={approvals} busy={phase === 'running'} voice={checkpointVoice} onDecision={onDecision} />}
        {inputRequests.length > 0 && <UserInputCard requests={inputRequests} busy={phase === 'running'} voice={checkpointVoice} onSubmit={onInputSubmit} />}

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
