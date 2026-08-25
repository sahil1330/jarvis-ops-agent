export type SystemName = 'harness' | 'gmail' | 'calendar' | 'sandbox';
export type OperationalSystem = Exclude<SystemName, 'harness'>;
export type SystemState = 'unknown' | 'checking' | 'offline' | 'ready' | 'active' | 'error';
export type AgentPhase = 'idle' | 'running' | 'paused' | 'done' | 'error';
export type HealthPhase = 'loading' | 'ready' | 'error';

export type SystemStatus = {
  state: SystemState;
  detail: string;
};

export type SystemStatuses = Record<SystemName, SystemStatus>;

export type OperationNotice = {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  message: string;
  system?: OperationalSystem;
};

export type TraceItem = {
  id: string;
  category: 'harness' | 'connector' | 'sandbox' | 'subagent' | 'tool';
  title: string;
  detail?: string;
  state: 'active' | 'done' | 'waiting' | 'error';
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
  | { type: 'system'; system: OperationalSystem; state: 'ready' | 'active' | 'error'; detail: string }
  | OperationNotice & { type: 'notice' }
  | { type: 'delta'; content: string }
  | { type: 'approval'; calls: ApprovalCall[] }
  | { type: 'metrics'; totalTokens?: number; totalCostUsd?: number }
  | { type: 'error'; message: string };

export type Health = {
  status: 'ok';
  harness: { connected: boolean; version?: string };
  agent: string;
  mode: 'demo' | 'live';
  audio?: { stt: boolean; tts: boolean };
};
