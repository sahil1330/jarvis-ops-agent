import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { CommandComposer } from './components/CommandComposer';
import { ExecutionTrace } from './components/ExecutionTrace';
import { OutcomePanel } from './components/OutcomePanel';
import { SystemRail } from './components/SystemRail';
import { createSession, getHealth, resolveApproval, runTurn } from './lib/api';
import { githubSystemStatusFromTrace } from './lib/github-system-status';
import {
  finishApprovalResumeTiming,
  finishToolTiming,
  finishTurnTelemetry,
  markFirstAgentFeedback,
  resetLatencyTelemetry,
  startApprovalResumeTiming,
  startToolTiming,
  startTurnTelemetry,
} from './lib/latency';
import { approvalDecisionNarration } from './lib/progress-narration';
import {
  clearPausedCheckpoint,
  clearResumableSession,
  persistPausedCheckpoint,
  persistSessionId,
  readPausedCheckpoint,
  readSessionId,
} from './lib/session-resume';
import { voiceApprovalDecision } from './lib/voice-approval';
import type { AgentPhase, ApprovalCall, Health, HealthPhase, OperationNotice, ProgressNarration, StreamEvent, SystemStatuses, TraceItem } from './types';

const MAX_RESPONSE_CHARACTERS = 100_000;

const INITIAL_SYSTEMS: SystemStatuses = {
  harness: { state: 'checking', detail: 'Checking TrueForge' },
  gmail: { state: 'unknown', detail: 'Not checked this session' },
  calendar: { state: 'unknown', detail: 'Not checked this session' },
  github: { state: 'unknown', detail: 'Not checked this session' },
  sandbox: { state: 'unknown', detail: 'Not used this session' },
};

type ApprovalRuntimeState = {
  phase: AgentPhase;
  sessionId: string | null;
  key: string;
};

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

function approvalKey(calls: ApprovalCall[]): string {
  return calls
    .map((call) => `${call.threadId}:${call.toolCallId}`)
    .sort()
    .join('|');
}

function approvalVoiceContext(state: ApprovalRuntimeState): string {
  if (state.phase !== 'paused' || !state.sessionId || !state.key) return '';
  return `approval:${state.sessionId}:${state.key}`;
}

export default function App() {
  const [restoredCheckpoint] = useState(() => readPausedCheckpoint());
  const [command, setCommand] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => restoredCheckpoint?.sessionId ?? readSessionId());
  const [phase, setPhase] = useState<AgentPhase>(() => restoredCheckpoint ? 'paused' : 'idle');
  const [trace, setTrace] = useState<TraceItem[]>(() => restoredCheckpoint?.trace ?? []);
  const [response, setResponse] = useState(() => restoredCheckpoint?.response ?? '');
  const [narrations, setNarrations] = useState<ProgressNarration[]>(() => restoredCheckpoint
    ? [{ id: 'restored-checkpoint', content: 'Approval checkpoint restored from this tab.' }]
    : []);
  const [notices, setNotices] = useState<OperationNotice[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCall[]>(() => restoredCheckpoint?.approvals ?? []);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthPhase, setHealthPhase] = useState<HealthPhase>('loading');
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<{ totalTokens?: number; totalCostUsd?: number }>({});
  const [systems, setSystems] = useState<SystemStatuses>(INITIAL_SYSTEMS);
  const [speechCancelToken, setSpeechCancelToken] = useState(0);
  const activeStream = useRef<AbortController | null>(null);
  const streamGeneration = useRef(0);
  const localNarrationSequence = useRef(0);
  const outcomePanel = useRef<HTMLElement | null>(null);
  const outcomeRevealed = useRef(false);
  const restoredCheckpointActiveRef = useRef(Boolean(restoredCheckpoint));
  const decideRef = useRef<(status: 'allow' | 'deny') => void>(() => undefined);
  const approvalStateRef = useRef<ApprovalRuntimeState>({
    phase,
    sessionId,
    key: approvalKey(approvals),
  });
  approvalStateRef.current = { phase, sessionId, key: approvalKey(approvals) };

  const revealOutcome = useCallback((focusAlert = false) => {
    if (outcomeRevealed.current && !focusAlert) return;
    outcomeRevealed.current = true;
    window.setTimeout(() => {
      const panel = outcomePanel.current;
      if (!panel) return;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
      panel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    }, 0);
  }, []);

  const addLocalNarration = useCallback((content: string, interrupt = false) => {
    const id = `local-narration:${++localNarrationSequence.current}`;
    setNarrations((current) => [...current, { id, content, ...(interrupt ? { interrupt: true } : {}) }].slice(-8));
    revealOutcome();
  }, [revealOutcome]);

  useEffect(() => {
    if (sessionId) persistSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (phase !== 'paused' || !sessionId || approvals.length === 0) return;
    persistPausedCheckpoint({ sessionId, approvals, response, trace });
  }, [approvals, phase, response, sessionId, trace]);

  useEffect(() => {
    const controller = new AbortController();
    void getHealth(controller.signal)
      .then((result) => {
        setHealth(result);
        setHealthPhase('ready');
        const currentPhase = approvalStateRef.current.phase;
        const restoredStillActive = restoredCheckpointActiveRef.current && currentPhase === 'paused';
        setSystems((current) => ({
          ...current,
          harness: !result.harness.connected
            ? { state: 'offline', detail: 'TrueForge is not reachable' }
            : restoredStillActive
              ? { state: 'active', detail: 'Approval checkpoint restored' }
              : currentPhase === 'running'
                ? { state: 'active', detail: 'TrueForge is running the turn' }
                : currentPhase === 'paused'
                  ? { state: 'active', detail: 'Waiting for your approval' }
                  : { state: 'ready', detail: 'TrueForge connected' },
        }));
      })
      .catch((reason: unknown) => {
        if (isAbortError(reason)) return;
        setHealthPhase('error');
        setError(reason instanceof Error ? reason.message : 'Unable to reach orchestrator');
        setSystems((current) => ({ ...current, harness: { state: 'offline', detail: 'Orchestrator health check failed' } }));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => activeStream.current?.abort(), []);

  const handleEvent = useCallback((event: StreamEvent) => {
    if (event.type === 'status') {
      if (event.status === 'running') {
        restoredCheckpointActiveRef.current = false;
        approvalStateRef.current = { ...approvalStateRef.current, phase: 'running', key: '' };
        setPhase('running');
        setTrace((current) => current.map((item) => item.state === 'waiting' ? { ...item, state: 'done' } : item));
        setSystems((current) => ({ ...current, harness: { state: 'active', detail: 'TrueForge is running the turn' } }));
      }
      if (event.status === 'paused') {
        approvalStateRef.current = { ...approvalStateRef.current, phase: 'paused' };
        setPhase('paused');
        setSystems((current) => ({ ...current, harness: { state: 'active', detail: 'Waiting for your approval' } }));
      }
      if (event.status === 'done') {
        restoredCheckpointActiveRef.current = false;
        approvalStateRef.current = { ...approvalStateRef.current, phase: 'done', key: '' };
        clearPausedCheckpoint();
        setApprovals([]);
        finishTurnTelemetry();
        setPhase('done');
        setSystems((current) => ({ ...current, harness: { state: 'ready', detail: 'Turn completed' } }));
      }
      if (event.status === 'cancelled') {
        restoredCheckpointActiveRef.current = false;
        approvalStateRef.current = { ...approvalStateRef.current, phase: 'idle', key: '' };
        clearPausedCheckpoint();
        setApprovals([]);
        finishTurnTelemetry();
        setPhase('idle');
        setSystems((current) => ({ ...current, harness: { state: 'ready', detail: 'Turn cancelled' } }));
      }
      return;
    }
    if (event.type === 'trace') {
      if (event.category === 'tool') {
        if (event.state === 'active') startToolTiming(event.id, event.title);
        if (event.state === 'done' || event.state === 'error') finishToolTiming(event.id);
      }
      const nextItem = { ...event, timestamp: Date.now() };
      const githubStatus = githubSystemStatusFromTrace(nextItem);
      if (githubStatus) setSystems((current) => ({ ...current, github: githubStatus }));
      setTrace((current) => {
        const existingIndex = current.findIndex((item) => item.id === event.id);
        if (existingIndex === -1) return [...current, nextItem].slice(-24);
        const next = [...current];
        next[existingIndex] = nextItem;
        return next.slice(-24);
      });
      if (event.state === 'error') revealOutcome(true);
      return;
    }
    if (event.type === 'system') {
      setSystems((current) => ({ ...current, [event.system]: { state: event.state, detail: event.detail } }));
      if (event.state === 'ready') setNotices((current) => current.filter((notice) => notice.system !== event.system));
      return;
    }
    if (event.type === 'notice') {
      setNotices((current) => {
        const withoutPrevious = current.filter((notice) => event.id !== notice.id && (!event.system || notice.system !== event.system));
        const next = [...withoutPrevious, event];
        const keepUnscopedIds = new Set(next.filter((notice) => notice.system === undefined).slice(-4).map((notice) => notice.id));
        return next.filter((notice) => notice.system !== undefined || keepUnscopedIds.has(notice.id));
      });
      revealOutcome(event.severity === 'error');
      return;
    }
    if (event.type === 'narration') {
      markFirstAgentFeedback();
      setNarrations((current) => current.some((item) => item.id === event.id)
        ? current
        : [...current, { id: event.id, content: event.content }].slice(-8));
      revealOutcome();
      return;
    }
    if (event.type === 'delta') {
      markFirstAgentFeedback();
      setResponse((current) => `${current}${event.content}`.slice(-MAX_RESPONSE_CHARACTERS));
      revealOutcome();
      return;
    }
    if (event.type === 'approval') {
      restoredCheckpointActiveRef.current = false;
      approvalStateRef.current = {
        phase: 'paused',
        sessionId: approvalStateRef.current.sessionId,
        key: approvalKey(event.calls),
      };
      setApprovals(event.calls);
      setPhase('paused');
      revealOutcome();
      return;
    }
    if (event.type === 'metrics') {
      setMetrics({
        ...(event.totalTokens !== undefined ? { totalTokens: event.totalTokens } : {}),
        ...(event.totalCostUsd !== undefined ? { totalCostUsd: event.totalCostUsd } : {}),
      });
      return;
    }
    if (event.type === 'error') {
      restoredCheckpointActiveRef.current = false;
      approvalStateRef.current = { ...approvalStateRef.current, phase: 'error', key: '' };
      finishTurnTelemetry();
      setError(event.message);
      setPhase('error');
      revealOutcome(true);
    }
  }, [revealOutcome]);

  const beginStream = useCallback(() => {
    activeStream.current?.abort();
    const controller = new AbortController();
    activeStream.current = controller;
    const generation = ++streamGeneration.current;
    return {
      controller,
      onEvent: (event: StreamEvent) => {
        if (!controller.signal.aborted && streamGeneration.current === generation) handleEvent(event);
      },
    };
  }, [handleEvent]);

  const execute = useCallback(async () => {
    if (phase === 'running' || phase === 'paused' || command.trim().length < 2) return;
    restoredCheckpointActiveRef.current = false;
    approvalStateRef.current = { phase: 'running', sessionId, key: '' };
    startTurnTelemetry();
    setError('');
    setResponse('');
    setNarrations([]);
    setNotices([]);
    setApprovals([]);
    setTrace([]);
    setMetrics({});
    setPhase('running');
    outcomeRevealed.current = false;
    addLocalNarration("Got it. I'll handle that.");
    const stream = beginStream();

    try {
      const activeSession = sessionId ?? (await createSession(stream.controller.signal));
      if (stream.controller.signal.aborted) return;
      approvalStateRef.current = { phase: 'running', sessionId: activeSession, key: '' };
      if (!sessionId) setSessionId(activeSession);
      persistSessionId(activeSession);
      await runTurn(activeSession, command.trim(), stream.onEvent, stream.controller.signal);
    } catch (reason) {
      if (isAbortError(reason)) return;
      approvalStateRef.current = { ...approvalStateRef.current, phase: 'error', key: '' };
      finishTurnTelemetry();
      setError(reason instanceof Error ? reason.message : 'The command failed.');
      setPhase('error');
      revealOutcome(true);
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [addLocalNarration, beginStream, command, phase, revealOutcome, sessionId]);

  const decide = useCallback(async (status: 'allow' | 'deny') => {
    const expectedSessionId = sessionId;
    const expectedApprovals = approvals;
    const expectedKey = approvalKey(expectedApprovals);
    const current = approvalStateRef.current;
    if (
      !expectedSessionId ||
      expectedApprovals.length === 0 ||
      current.phase !== 'paused' ||
      current.sessionId !== expectedSessionId ||
      current.key !== expectedKey
    ) return;

    restoredCheckpointActiveRef.current = false;
    approvalStateRef.current = { phase: 'running', sessionId: expectedSessionId, key: '' };
    setSpeechCancelToken((value) => value + 1);
    startApprovalResumeTiming();
    setError('');
    setPhase('running');
    const stream = beginStream();
    let accepted = false;

    try {
      await resolveApproval(
        expectedSessionId,
        expectedApprovals.map((call) => ({
          threadId: call.threadId,
          toolCallId: call.toolCallId,
          status,
          ...(status === 'deny' ? { reason: 'Denied from the Jarvis control center' } : {}),
        })),
        stream.onEvent,
        stream.controller.signal,
        () => {
          accepted = true;
          clearPausedCheckpoint();
          setApprovals([]);
          finishApprovalResumeTiming();
          const narration = approvalDecisionNarration(expectedApprovals, status);
          if (narration) addLocalNarration(narration, true);
        },
      );
      setApprovals([]);
    } catch (reason) {
      if (isAbortError(reason)) return;
      if (accepted) {
        approvalStateRef.current = { phase: 'error', sessionId: expectedSessionId, key: '' };
        clearPausedCheckpoint();
        setApprovals([]);
        setError('Your approval was accepted, but the resumed execution stream was interrupted. This checkpoint is no longer retryable.');
        setPhase('error');
      } else {
        approvalStateRef.current = { phase: 'paused', sessionId: expectedSessionId, key: expectedKey };
        setApprovals(expectedApprovals);
        setError(reason instanceof Error ? reason.message : 'Could not resume the agent.');
        setPhase('paused');
      }
      revealOutcome(true);
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [addLocalNarration, approvals, beginStream, revealOutcome, sessionId]);
  decideRef.current = decide;

  const handleVoiceTranscript = useCallback((text: string, sourceContextKey: string): boolean => {
    if (!sourceContextKey.startsWith('approval:')) return false;
    const current = approvalStateRef.current;
    const currentContextKey = approvalVoiceContext(current);
    if (!currentContextKey || sourceContextKey !== currentContextKey) return true;

    const decision = voiceApprovalDecision(text);
    if (!decision) {
      addLocalNarration('Approval is still pending. Please say “Approve it” or “Deny it”, or use the buttons.', true);
      return true;
    }
    decideRef.current(decision);
    return true;
  }, [addLocalNarration]);

  const reset = useCallback(() => {
    restoredCheckpointActiveRef.current = false;
    approvalStateRef.current = { phase: 'idle', sessionId: null, key: '' };
    setSpeechCancelToken((value) => value + 1);
    activeStream.current?.abort();
    activeStream.current = null;
    streamGeneration.current += 1;
    resetLatencyTelemetry();
    clearResumableSession();
    setSessionId(null);
    setPhase('idle');
    setTrace([]);
    setResponse('');
    setNarrations([]);
    setNotices([]);
    setApprovals([]);
    setError('');
    setMetrics({});
    outcomeRevealed.current = false;
    setSystems({
      ...INITIAL_SYSTEMS,
      harness: health?.harness.connected
        ? { state: 'ready', detail: 'TrueForge connected' }
        : healthPhase === 'loading'
          ? INITIAL_SYSTEMS.harness
          : { state: 'offline', detail: 'TrueForge is not reachable' },
    });
  }, [health, healthPhase]);

  const hasToolIssues = systems.gmail.state === 'error' || systems.calendar.state === 'error' || systems.github.state === 'error' || systems.sandbox.state === 'error' || notices.some((notice) => notice.severity === 'error');

  const statusLabel = (() => {
    if (healthPhase === 'loading') return 'Checking harness…';
    if (healthPhase === 'error') return 'Harness unavailable';
    if (!health?.harness.connected) return 'Harness offline';
    if (hasToolIssues && phase === 'running') return 'Tool issue — agent continuing';
    if (hasToolIssues && phase === 'done') return 'Completed with issues';
    if (phase === 'running') return 'Agent working';
    if (phase === 'paused') return restoredCheckpointActiveRef.current ? 'Approval restored' : 'Awaiting approval';
    if (phase === 'done') return 'Task complete';
    if (phase === 'error') return 'Attention needed';
    return sessionId ? 'Session reattached' : 'Ready for command';
  })();

  const voiceContextKey = approvalVoiceContext(approvalStateRef.current);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to command center</a>
      <header className="topbar">
        <BrandMark />
        <div className={`status-pill phase-${phase} health-${healthPhase}${hasToolIssues ? ' has-issues' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          <Activity size={14} aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
        <button type="button" className="new-session" onClick={reset}><RotateCcw size={14} /> New session</button>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="workspace">
          <CommandComposer
            command={command}
            onChange={setCommand}
            onSubmit={execute}
            onVoiceTranscript={handleVoiceTranscript}
            disabled={phase === 'running'}
            approvalMode={phase === 'paused'}
            speechCancelToken={speechCancelToken}
            voiceContextKey={voiceContextKey}
          />
          <div className="operations-column">
            <OutcomePanel
              panelRef={outcomePanel}
              phase={phase}
              response={response}
              narrations={narrations}
              notices={notices}
              approvals={approvals}
              error={error}
              metrics={metrics}
              realtimeVoiceAvailable={Boolean(health?.audio?.realtime)}
              neuralTtsAvailable={Boolean(health?.audio?.tts)}
              onDecision={decide}
            />
            <ExecutionTrace items={trace} phase={phase} />
          </div>
          <SystemRail health={health} systems={systems} />
        </div>
      </main>
      <footer><span>TRUEFORGE HARNESS</span><span>TOOLS VIA MCP</span><span>CODE IN SANDBOX</span><span>HUMAN IN CONTROL</span></footer>
    </div>
  );
}
