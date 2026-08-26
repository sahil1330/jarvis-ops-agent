import type { ApprovalCall, TraceItem } from '../types';

const SESSION_KEY = 'jarvis.trueforge.session';
const CHECKPOINT_KEY = 'jarvis.trueforge.paused-checkpoint';
const TRACE_CATEGORIES = new Set<TraceItem['category']>(['harness', 'connector', 'sandbox', 'subagent', 'tool']);
const TRACE_STATES = new Set<TraceItem['state']>(['active', 'done', 'waiting', 'error']);

export type PausedCheckpoint = {
  sessionId: string;
  approvals: ApprovalCall[];
  response: string;
  trace: TraceItem[];
};

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isApprovalCall(value: unknown): value is ApprovalCall {
  if (!isRecord(value)) return false;
  return (
    typeof value.threadId === 'string' && value.threadId.length > 0 &&
    typeof value.toolCallId === 'string' && value.toolCallId.length > 0 &&
    typeof value.toolName === 'string' && value.toolName.length > 0 &&
    typeof value.arguments === 'string' &&
    isOptionalString(value.serverName)
  );
}

function isTraceItem(value: unknown): value is TraceItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.category === 'string' && TRACE_CATEGORIES.has(value.category as TraceItem['category']) &&
    typeof value.title === 'string' && value.title.length > 0 &&
    isOptionalString(value.detail) &&
    typeof value.state === 'string' && TRACE_STATES.has(value.state as TraceItem['state']) &&
    typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
  );
}

function removeCheckpoint(target: Storage | null): void {
  try {
    target?.removeItem(CHECKPOINT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function readSessionId(storage?: Storage): string | null {
  try {
    return storageOrNull(storage)?.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function persistSessionId(sessionId: string, storage?: Storage): void {
  try {
    storageOrNull(storage)?.setItem(SESSION_KEY, sessionId);
  } catch {
    // Session persistence is a UX enhancement; storage failure must not break the live run.
  }
}

export function readPausedCheckpoint(storage?: Storage): PausedCheckpoint | null {
  const target = storageOrNull(storage);
  try {
    const raw = target?.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      removeCheckpoint(target);
      return null;
    }

    const sessionId = value.sessionId;
    const approvals = value.approvals;
    const response = value.response;
    const trace = value.trace;
    if (
      typeof sessionId !== 'string' || sessionId.length === 0 ||
      !Array.isArray(approvals) || approvals.length === 0 || approvals.length > 50 || !approvals.every(isApprovalCall) ||
      typeof response !== 'string' ||
      !Array.isArray(trace) || trace.length > 100 || !trace.every(isTraceItem)
    ) {
      removeCheckpoint(target);
      return null;
    }

    return { sessionId, approvals, response, trace };
  } catch {
    removeCheckpoint(target);
    return null;
  }
}

export function persistPausedCheckpoint(checkpoint: PausedCheckpoint, storage?: Storage): void {
  try {
    storageOrNull(storage)?.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
  } catch {
    // Keep the live approval path working even if tab storage is unavailable.
  }
}

export function clearPausedCheckpoint(storage?: Storage): void {
  removeCheckpoint(storageOrNull(storage));
}

export function clearResumableSession(storage?: Storage): void {
  try {
    const target = storageOrNull(storage);
    target?.removeItem(SESSION_KEY);
    target?.removeItem(CHECKPOINT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
