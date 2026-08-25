import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { ApprovalCard } from './components/ApprovalCard';
import { BrandMark } from './components/BrandMark';
import { CommandComposer } from './components/CommandComposer';
import { ExecutionTrace } from './components/ExecutionTrace';
import { SystemRail } from './components/SystemRail';
import { createSession, getHealth, resolveApproval, runTurn } from './lib/api';
import type { ApprovalCall, Health, StreamEvent, TraceItem } from './types';

type Phase = 'idle' | 'running' | 'paused' | 'done' | 'error';
type HealthPhase = 'loading' | 'ready' | 'error';
const MAX_RESPONSE_CHARACTERS = 100_000;

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

export default function App() {
  const [command, setCommand] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [response, setResponse] = useState('');
  const [approvals, setApprovals] = useState<ApprovalCall[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthPhase, setHealthPhase] = useState<HealthPhase>('loading');
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<{ totalTokens?: number; totalCostUsd?: number }>({});
  const activeStream = useRef<AbortController | null>(null);
  const streamGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void getHealth(controller.signal)
      .then((result) => {
        setHealth(result);
        setHealthPhase('ready');
      })
      .catch((reason: unknown) => {
        if (isAbortError(reason)) return;
        setHealthPhase('error');
        setError(reason instanceof Error ? reason.message : 'Unable to reach orchestrator');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => activeStream.current?.abort(), []);

  const handleEvent = useCallback((event: StreamEvent) => {
    if (event.type === 'status') {
      if (event.status === 'running') setPhase('running');
      if (event.status === 'paused') setPhase('paused');
      if (event.status === 'done') setPhase('done');
      if (event.status === 'cancelled') setPhase('idle');
      return;
    }
    if (event.type === 'trace') {
      setTrace((current) => [...current, { ...event, timestamp: Date.now() }].slice(-24));
      return;
    }
    if (event.type === 'delta') {
      setResponse((current) => `${current}${event.content}`.slice(-MAX_RESPONSE_CHARACTERS));
      return;
    }
    if (event.type === 'approval') {
      setApprovals(event.calls);
      setPhase('paused');
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
    }
  }, []);

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
    setApprovals([]);
    setTrace([]);
    setMetrics({});
    setPhase('running');
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
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [beginStream, command, phase, sessionId]);

  const decide = useCallback(async (status: 'allow' | 'deny') => {
    if (!sessionId || approvals.length === 0) return;
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
    } finally {
      if (activeStream.current === stream.controller) activeStream.current = null;
    }
  }, [approvals, beginStream, sessionId]);

  const reset = useCallback(() => {
    activeStream.current?.abort();
    activeStream.current = null;
    streamGeneration.current += 1;
    setSessionId(null);
    setPhase('idle');
    setTrace([]);
    setResponse('');
    setApprovals([]);
    setError('');
    setMetrics({});
  }, []);

  const statusLabel = (() => {
    if (healthPhase === 'loading') return 'Checking harness…';
    if (healthPhase === 'error') return 'Harness unavailable';
    if (!health?.harness.connected) return 'Harness offline';
    if (phase === 'running') return 'Agent working';
    if (phase === 'paused') return 'Awaiting approval';
    if (phase === 'done') return 'Task complete';
    if (phase === 'error') return 'Attention needed';
    return 'Ready for command';
  })();

  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark />
        <div className={`status-pill phase-${phase}`}><Activity size={14} /><span>{statusLabel}</span></div>
        <button type="button" className="new-session" onClick={reset}><RotateCcw size={14} /> New session</button>
      </header>

      <main>
        <div className="workspace">
          <CommandComposer command={command} onChange={setCommand} onSubmit={execute} disabled={phase === 'running'} />
          <ExecutionTrace items={trace} />
          <SystemRail health={health} healthPhase={healthPhase} phase={phase} />
        </div>

        {(response || approvals.length > 0 || error) && (
          <div className="result-dock">
            {response && (
              <section className="agent-response" aria-live="polite">
                <div className="response-label"><i /> JARVIS</div>
                <p>{response}</p>
                {(metrics.totalTokens !== undefined || metrics.totalCostUsd !== undefined) && (
                  <small>{metrics.totalTokens?.toLocaleString() ?? '—'} tokens · ${metrics.totalCostUsd?.toFixed(4) ?? '—'}</small>
                )}
              </section>
            )}
            {approvals.length > 0 && <ApprovalCard calls={approvals} busy={phase === 'running'} onDecision={decide} />}
            {error && <div className="error-banner" role="alert"><strong>Jarvis could not continue.</strong><span>{error}</span></div>}
          </div>
        )}
      </main>
      <footer><span>TRUEFORGE HARNESS</span><span>TOOLS VIA MCP</span><span>CODE IN SANDBOX</span><span>HUMAN IN CONTROL</span></footer>
    </div>
  );
}
