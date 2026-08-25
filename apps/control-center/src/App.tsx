import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { CommandComposer } from './components/CommandComposer';
import { ExecutionTrace } from './components/ExecutionTrace';
import { OutcomePanel } from './components/OutcomePanel';
import { SystemRail } from './components/SystemRail';
import { createSession, getHealth, resolveApproval, runTurn } from './lib/api';
import { approvalDecisionNarration } from './lib/progress-narration';
import type { AgentPhase, ApprovalCall, Health, HealthPhase, OperationNotice, ProgressNarration, StreamEvent, SystemStatuses, TraceItem } from './types';
const MAX_RESPONSE_CHARACTERS = 100_000;

const INITIAL_SYSTEMS: SystemStatuses = {
  harness: { state: 'checking', detail: 'Checking TrueForge' },
  gmail: { state: 'unknown', detail: 'Not checked this session' },
  calendar: { state: 'unknown', detail: 'Not checked this session' },
  sandbox: { state: 'unknown', detail: 'Not used this session' },
};

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

export default function App() {
  const [command, setCommand] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [response, setResponse] = useState('');
  const [narrations, setNarrations] = useState<ProgressNarration[]>([]);
  const [notices, setNotices] = useState<OperationNotice[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCall[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthPhase, setHealthPhase] = useState<HealthPhase>('loading');
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<{ totalTokens?: number; totalCostUsd?: number }>({});
  const [systems, setSystems] = useState<SystemStatuses>(INITIAL_SYSTEMS);
  const activeStream = useRef<AbortController | null>(null);
  const streamGeneration = useRef(0);
  const localNarrationSequence = useRef(0);
  const outcomePanel = useRef<HTMLElement | null>(null);
  const outcomeRevealed = useRef(false);

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

  const addLocalNarration = useCallback((content: string) => {
    const id = `local-narration:${++localNarrationSequence.current}`;
    setNarrations((current) => [...current, { id, content }].slice(-8));
    revealOutcome();
  }, [revealOutcome]);

  useEffect(() => {
    const controller = new AbortController();
    void getHealth(controller.signal)
      .then((result) => {
        setHealth(result);
        setHealthPhase('ready');
        setSystems((current) => ({
          ...current,
          harness: result.harness.connected
            ? { state: 'ready', detail: 'TrueForge connected' }
            : { state: 'offline', detail: 'TrueForge is not reachable' },
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
        setPhase('running');
        setTrace((current) => current.map((item) => item.state === 'waiting' ? { ...item, state: 'done' } : item));
        setSystems((current) => ({ ...current, harness: { state: 'active', detail: 'TrueForge is running the turn' } }));
      }
      if (event.status === 'paused') {
        setPhase('paused');
        setSystems((current) => ({ ...current, harness: { state: 'active', detail: 'Waiting for your approval' } }));
      }
      if (event.status === 'done') {
        setPhase('done');
        setSystems((current) => ({ ...current, harness: { state: 'ready', detail: 'Turn completed' } }));
      }
      if (event.status === 'cancelled') {
        setPhase('idle');
        setSystems((current) => ({ ...current, harness: { state: 'ready', detail: 'Turn cancelled' } }));
      }
      return;
    }
    if (event.type === 'trace') {
      setTrace((current) => {
        const nextItem = { ...event, timestamp: Date.now() };
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
      setSystems((current) => ({
        ...current,
        [event.system]: { state: event.state, detail: event.detail },
      }));
      if (event.state === 'ready') {
        setNotices((current) => current.filter((notice) => notice.system !== event.system));
      }
      return;
    }
    if (event.type === 'notice') {
      setNotices((current) => {
        const withoutPrevious = current.filter((notice) => (
          notice.id !== event.id && (!event.system || notice.system !== event.system)
        ));
        const next = [...withoutPrevious, event];
        const keepUnscopedIds = new Set(
          next
            .filter((notice) => notice.system === undefined)
            .slice(-4)
            .map((notice) => notice.id),
        );
        return next.filter(
          (notice) => notice.system !== undefined || keepUnscopedIds.has(notice.id),
        );
      });
      revealOutcome(event.severity === 'error');
      return;
    }
    if (event.type === 'narration') {
      setNarrations((current) => {
        if (current.some((item) => item.id === event.id)) return current;
        return [...current, { id: event.id, content: event.content }].slice(-8);
      });
      revealOutcome();
      return;
    }
    if (event.type === 'delta') {
      setResponse((current) => `${current}${event.content}`.slice(-MAX_RESPONSE_CHARACTERS));
      revealOutcome();
      return;
    }
    if (event.type === 'approval') {
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
    if (phase === 'running' || command.trim().length < 2) return;
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
      if (!sessionId) setSessionId(activeSession);
      await runTurn(activeSession, command.trim(), stream.onEvent, stream.controller.signal);
    } catch (reason) {
      if (isAbortError(reason)) return;
      setError(reason instanceof Error ? reason.message : 'The command failed.');
      setPhase('error');
      revealOutcome(true);
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [addLocalNarration, beginStream, command, phase, revealOutcome, sessionId]);

  const decide = useCallback(async (status: 'allow' | 'deny') => {
    if (!sessionId || approvals.length === 0) return;
    const narration = approvalDecisionNarration(approvals, status);
    if (narration) addLocalNarration(narration);
    setError('');
    setPhase('running');
    const stream = beginStream();
    try {
      await resolveApproval(
        sessionId,
        approvals.map((call) => ({
          threadId: call.threadId,
          toolCallId: call.toolCallId,
          status,
          ...(status === 'deny' ? { reason: 'Denied from the Jarvis control center' } : {}),
        })),
        stream.onEvent,
        stream.controller.signal,
      );
      setApprovals([]);
    } catch (reason) {
      if (isAbortError(reason)) return;
      setError(reason instanceof Error ? reason.message : 'Could not resume the agent.');
      setPhase('error');
      revealOutcome(true);
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [addLocalNarration, approvals, beginStream, revealOutcome, sessionId]);

  const reset = useCallback(() => {
    activeStream.current?.abort();
    activeStream.current = null;
    streamGeneration.current += 1;
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

  const hasToolIssues = (
    systems.gmail.state === 'error' ||
    systems.calendar.state === 'error' ||
    systems.sandbox.state === 'error' ||
    notices.some((notice) => notice.severity === 'error')
  );

  const statusLabel = (() => {
    if (healthPhase === 'loading') return 'Checking harness…';
    if (healthPhase === 'error') return 'Harness unavailable';
    if (!health?.harness.connected) return 'Harness offline';
    if (hasToolIssues && phase === 'running') return 'Tool issue — agent continuing';
    if (hasToolIssues && phase === 'done') return 'Completed with issues';
    if (phase === 'running') return 'Agent working';
    if (phase === 'paused') return 'Awaiting approval';
    if (phase === 'done') return 'Task complete';
    if (phase === 'error') return 'Attention needed';
    return 'Ready for command';
  })();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to command center</a>
      <header className="topbar">
        <BrandMark />
        <div
          className={`status-pill phase-${phase} health-${healthPhase}${hasToolIssues ? ' has-issues' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Activity size={14} aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
        <button type="button" className="new-session" onClick={reset}><RotateCcw size={14} /> New session</button>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="workspace">
          <CommandComposer command={command} onChange={setCommand} onSubmit={execute} disabled={phase === 'running'} />
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