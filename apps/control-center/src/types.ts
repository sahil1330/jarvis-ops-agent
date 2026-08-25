export type SystemState = 'offline' | 'ready' | 'active' | 'waiting';
export type AgentPhase = 'idle' | 'running' | 'paused' | 'done' | 'error';
export type HealthPhase = 'loading' | 'ready' | 'error';

export type TraceItem = {
  id: string;
  category: 'harness' | 'connector' | 'sandbox' | 'subagent' | 'tool';
  title: string;
  detail?: string;
  state: 'active' | 'done' | 'waiting';
  timestamp: number;
};

export type ApprovalCall = {
  threadId: string;
  toolCallId: string;
  toolName: string;
  serverName?: string;
  arguments: string;
};

export type StreamEvent =
  | { type: 'status'; status: 'connected' | 'running' | 'paused' | 'done' | 'cancelled' }
  | Omit<TraceItem, 'timestamp'> & { type: 'trace' }
  | { type: 'delta'; content: string }
  | { type: 'approval'; calls: ApprovalCall[] }
  | { type: 'metrics'; totalTokens?: number; totalCostUsd?: number }
  | { type: 'error'; message: string };

export type Health = {
  status: 'ok';
  harness: { connected: boolean; version?: string };
  agent: string;
  mode: 'demo' | 'live';
};
