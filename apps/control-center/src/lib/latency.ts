export type ToolLatency = {
  id: string;
  label: string;
  durationMs: number;
};

export type LatencySnapshot = {
  sttMs?: number;
  firstAgentMs?: number;
  firstToolMs?: number;
  firstVoiceMs?: number;
  approvalResumeMs?: number;
  totalTurnMs?: number;
  tools: ToolLatency[];
};

type Listener = () => void;

let snapshot: LatencySnapshot = { tools: [] };
let turnStartedAt: number | null = null;
let approvalStartedAt: number | null = null;
const toolStarts = new Map<string, { startedAt: number; label: string }>();
const listeners = new Set<Listener>();

function now(): number {
  return performance.now();
}

function publish(next: LatencySnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function update(patch: Partial<LatencySnapshot>): void {
  publish({ ...snapshot, ...patch });
}

export function subscribeLatency(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLatencySnapshot(): LatencySnapshot {
  return snapshot;
}

export function recordSttLatency(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  update({ sttMs: Math.round(durationMs) });
}

export function startTurnTelemetry(): void {
  const previousStt = snapshot.sttMs;
  turnStartedAt = now();
  approvalStartedAt = null;
  toolStarts.clear();
  publish({ ...(previousStt !== undefined ? { sttMs: previousStt } : {}), tools: [] });
}

function markFirst(field: 'firstAgentMs' | 'firstToolMs' | 'firstVoiceMs'): void {
  if (turnStartedAt === null || snapshot[field] !== undefined) return;
  update({ [field]: Math.round(now() - turnStartedAt) });
}

export function markFirstAgentFeedback(): void {
  markFirst('firstAgentMs');
}

export function markFirstToolStart(): void {
  markFirst('firstToolMs');
}

export function markFirstVoiceStart(): void {
  markFirst('firstVoiceMs');
}

export function startToolTiming(id: string, label: string): void {
  if (!id || toolStarts.has(id)) return;
  markFirstToolStart();
  toolStarts.set(id, { startedAt: now(), label });
}

export function finishToolTiming(id: string): void {
  const started = toolStarts.get(id);
  if (!started) return;
  toolStarts.delete(id);
  const completed: ToolLatency = {
    id,
    label: started.label,
    durationMs: Math.max(0, Math.round(now() - started.startedAt)),
  };
  update({ tools: [...snapshot.tools.filter((item) => item.id !== id), completed].slice(-12) });
}

export function startApprovalResumeTiming(): void {
  approvalStartedAt = now();
}

export function finishApprovalResumeTiming(): void {
  if (approvalStartedAt === null) return;
  const duration = Math.max(0, Math.round(now() - approvalStartedAt));
  approvalStartedAt = null;
  update({ approvalResumeMs: duration });
}

export function finishTurnTelemetry(): void {
  if (turnStartedAt === null || snapshot.totalTurnMs !== undefined) return;
  update({ totalTurnMs: Math.max(0, Math.round(now() - turnStartedAt)) });
  turnStartedAt = null;
  approvalStartedAt = null;
  toolStarts.clear();
}

export function resetLatencyTelemetry(): void {
  turnStartedAt = null;
  approvalStartedAt = null;
  toolStarts.clear();
  publish({ tools: [] });
}

export function formatLatency(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}
