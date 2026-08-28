import { isEventDelta, mergeEventDelta, type TrueForgeApi } from '@truefoundry/trueforge-sdk';

export type ApprovalCall = {
  threadId: string;
  toolCallId: string;
  toolName: string;
  serverName?: string;
  arguments: string;
};

export type UserInputRequest = {
  threadId: string;
  toolCallId: string;
  toolName: string;
  question: string;
  options: string[];
};

export type OperationalSystem = 'gmail' | 'calendar' | 'sandbox';

type ToolPresentation = {
  system?: OperationalSystem;
  running: string;
  completed: string;
  failed: string;
};

type ToolCallDetails = {
  id: string;
  name: string;
};

type NarrationKey = 'gmail' | 'calendar' | 'memory';

export type ClientEvent =
  | { type: 'status'; status: 'connected' | 'running' | 'paused' | 'done' | 'cancelled' }
  | { type: 'trace'; id: string; category: 'harness' | 'connector' | 'sandbox' | 'subagent' | 'tool'; title: string; detail?: string; state: 'active' | 'done' | 'waiting' | 'error' }
  | { type: 'system'; system: OperationalSystem; state: 'ready' | 'active' | 'error'; detail: string }
  | { type: 'notice'; id: string; severity: 'error' | 'warning'; title: string; message: string; system?: OperationalSystem }
  | { type: 'narration'; id: string; content: string }
  | { type: 'delta'; content: string }
  | { type: 'approval'; calls: ApprovalCall[] }
  | { type: 'input_required'; requests: UserInputRequest[] }
  | { type: 'metrics'; totalTokens?: number; totalCostUsd?: number }
  | { type: 'error'; message: string };

type EventIndex = Map<string, TrueForgeApi.TurnStreamingEvent>;
const DEFAULT_MAX_EVENTS = 256;
const MAX_ERROR_DETAIL_CHARACTERS = 600;
const MAX_PREAMBLE_CHARACTERS = 600;
const MAX_INPUT_QUESTION_CHARACTERS = 1_000;
const MAX_INPUT_OPTION_CHARACTERS = 500;
const MAX_INPUT_OPTIONS = 20;

const TOOL_PRESENTATIONS: Record<string, ToolPresentation> = {
  search_emails: {
    system: 'gmail',
    running: 'Searching Gmail',
    completed: 'Gmail search completed',
    failed: 'Gmail search failed',
  },
  send_email: {
    system: 'gmail',
    running: 'Preparing Gmail action',
    completed: 'Gmail action completed',
    failed: 'Gmail action failed',
  },
  list_calendar_events: {
    system: 'calendar',
    running: 'Checking Google Calendar',
    completed: 'Calendar check completed',
    failed: 'Calendar check failed',
  },
  move_calendar_event: {
    system: 'calendar',
    running: 'Preparing calendar change',
    completed: 'Calendar change completed',
    failed: 'Calendar change failed',
  },
};

function titleFromToolName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function presentationFor(name: string): ToolPresentation {
  return TOOL_PRESENTATIONS[name] ?? {
    running: `${titleFromToolName(name)} in progress`,
    completed: `${titleFromToolName(name)} completed`,
    failed: `${titleFromToolName(name)} failed`,
  };
}

function narrationKeyForToolName(name: string): NarrationKey | undefined {
  if (name === 'list_calendar_events') return 'calendar';
  if (name === 'search_emails') return 'gmail';
  if (name === 'recall_memories') return 'memory';
  return undefined;
}

function narrationForToolCalls(calls: NonNullable<TrueForgeApi.ModelMessageEvent['toolCalls']>): string | undefined {
  const names = new Set(calls.map((call) => call.toolInfo.name));
  const checkingCalendar = names.has('list_calendar_events');
  const checkingGmail = names.has('search_emails');

  if (checkingCalendar && checkingGmail) return "I'll check your calendar and inbox in parallel.";
  if (checkingCalendar) return "I'll check your calendar now.";
  if (checkingGmail) return "I'll check your inbox now.";
  if (names.has('recall_memories')) return 'Let me check what I remember about that.';

  // External writes are deliberately not narrated here. They may still be awaiting approval.
  return undefined;
}

function preambleCoverage(text: string): Set<NarrationKey> {
  const normalized = text.toLowerCase();
  const soundsLikeNextAction = /\b(?:i['’]?ll|i will|let me|i['’]?m going to|i am going to|i['’]?m checking|i am checking|i['’]?m looking|i am looking|check|checking|look|looking|search|searching|review|reviewing)\b/.test(normalized);
  if (!soundsLikeNextAction) return new Set();

  const covered = new Set<NarrationKey>();
  if (/\b(?:calendar|schedule|meeting|meetings|event|events)\b/.test(normalized)) covered.add('calendar');
  if (/\b(?:gmail|inbox|email|emails|mail|message|messages)\b/.test(normalized)) covered.add('gmail');
  if (/\b(?:remember|memory|memories|preference|preferences)\b/.test(normalized)) covered.add('memory');
  return covered;
}

function parseJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'string' && parsed !== value) return parseJson(parsed);
    return parsed;
  } catch {
    return value;
  }
}

function userInputPresentation(rawArguments: string): Pick<UserInputRequest, 'question' | 'options'> {
  const parsed = parseJson(rawArguments);
  if (!isRecord(parsed)) {
    return { question: 'Jarvis needs additional information to continue.', options: [] };
  }

  const question = typeof parsed.question === 'string'
    ? parsed.question.trim().slice(0, MAX_INPUT_QUESTION_CHARACTERS)
    : '';
  const options = Array.isArray(parsed.options)
    ? [...new Set(parsed.options
      .filter((option): option is string => typeof option === 'string')
      .map((option) => option.trim().slice(0, MAX_INPUT_OPTION_CHARACTERS))
      .filter(Boolean))].slice(0, MAX_INPUT_OPTIONS)
    : [];

  return {
    question: question || 'Jarvis needs additional information to continue.',
    options,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorEnvelope(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (
    value.isError === true ||
    value.is_error === true ||
    (value.error !== undefined && value.error !== null && value.error !== false && value.error !== '')
  ) return value;
  if (isRecord(value.result)) return errorEnvelope(value.result);
  return null;
}

function textFromContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .flatMap((part) => (isRecord(part) && typeof part.text === 'string' ? [part.text] : []))
    .join('\n')
    .trim();
  return text || undefined;
}

function redactAndBound(value: string): string {
  return value
    .replace(/((?:access|refresh)[_-]?token|client[_-]?secret)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1$2[redacted]')
    .slice(0, MAX_ERROR_DETAIL_CHARACTERS);
}

function toolErrorMessage(content: string): string | null {
  const parsed = parseJson(content);
  const envelope = errorEnvelope(parsed);
  const plainTextFailure = typeof parsed === 'string' && /^(?:error\b|mcp tool error\b)/i.test(parsed.trim());
  if (!envelope && !plainTextFailure) return null;

  if (envelope) {
    const directError = envelope.error;
    const message =
      (typeof directError === 'string' ? directError : undefined) ??
      (isRecord(directError) && typeof directError.message === 'string' ? directError.message : undefined) ??
      (typeof envelope.message === 'string' ? envelope.message : undefined) ??
      textFromContent(envelope.content);
    if (message) return redactAndBound(message);
  }

  return redactAndBound(typeof parsed === 'string' ? parsed : content);
}

export class SessionEventState {
  private readonly events: EventIndex = new Map();
  private rootPreambleText = '';
  private readonly rootPreambleCoverage = new Set<NarrationKey>();

  constructor(private readonly maxEvents = DEFAULT_MAX_EVENTS) {}

  private remember(event: TrueForgeApi.TurnStreamingEvent): void {
    this.events.set(event.id, event);
    while (this.events.size > this.maxEvents) {
      const oldest = this.events.keys().next().value as string | undefined;
      if (!oldest) break;
      this.events.delete(oldest);
    }
  }

  private rememberRootPreamble(content: string): void {
    this.rootPreambleText = `${this.rootPreambleText}${content}`.slice(-MAX_PREAMBLE_CHARACTERS);
    const coverage = preambleCoverage(this.rootPreambleText);
    for (const key of coverage) this.rootPreambleCoverage.add(key);
  }

  private uncoveredNarrationCalls(
    calls: NonNullable<TrueForgeApi.ModelMessageEvent['toolCalls']>,
  ): NonNullable<TrueForgeApi.ModelMessageEvent['toolCalls']> {
    const uncovered = calls.filter((call) => {
      const key = narrationKeyForToolName(call.toolInfo.name);
      if (!key || !this.rootPreambleCoverage.has(key)) return true;
      this.rootPreambleCoverage.delete(key);
      return false;
    });
    if (this.rootPreambleCoverage.size === 0) this.rootPreambleText = '';
    return uncovered;
  }

  private findToolCall(toolCallId: string): ToolCallDetails | null {
    const events = Array.from(this.events.values());
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const source = events[index];
      if (source?.type !== 'model.message') continue;
      const call = source.toolCalls?.find((candidate) => candidate.id === toolCallId);
      if (call) return { id: call.id, name: call.toolInfo.name };
    }
    return null;
  }

  ingest(event: TrueForgeApi.TurnStreamingEvent): ClientEvent[] {
    if (isEventDelta(event)) {
      const base = this.events.get(event.id);
      if (base) mergeEventDelta(base, event);
    } else {
      this.remember(event);
    }

    switch (event.type) {
      case 'turn.created':
        this.rootPreambleText = '';
        this.rootPreambleCoverage.clear();
        return [
          { type: 'status', status: 'running' },
          {
            type: 'trace',
            id: 'turn:current',
            category: 'harness',
            title: 'TrueForge session started',
            detail: 'Persistent turn opened',
            state: 'active',
          },
        ];

      case 'mcp.initialize':
        return event.mcpServers.map((server) => ({
          type: 'trace' as const,
          id: `${event.id}:${server.id}`,
          category: 'connector' as const,
          title: `${server.name} connected`,
          detail: server.transportType ? `MCP · ${server.transportType}` : 'MCP connector ready',
          state: 'done' as const,
        }));

      case 'model.message': {
        if (event.threadId === 'main' && typeof event.content === 'string' && event.content.trim()) {
          this.rememberRootPreamble(event.content);
        }

        const calls = event.toolCalls ?? [];
        const narrationCalls = this.uncoveredNarrationCalls(calls);
        const narration = narrationCalls.length > 0 ? narrationForToolCalls(narrationCalls) : undefined;

        const toolEvents = calls.flatMap((call) => {
          const presentation = presentationFor(call.toolInfo.name);
          return [
            {
              type: 'trace' as const,
              id: `tool:${call.id}`,
              category: 'tool' as const,
              title: presentation.running,
              detail: call.toolInfo.type === 'mcp' ? `MCP · ${call.toolInfo.serverName}` : 'TrueForge system tool',
              state: 'active' as const,
            },
            ...(presentation.system
              ? [
                  {
                    type: 'system' as const,
                    system: presentation.system,
                    state: 'active' as const,
                    detail: presentation.running,
                  },
                ]
              : []),
          ];
        });

        return [
          ...(narration
            ? [{ type: 'narration' as const, id: `tool-narration:${event.id}`, content: narration }]
            : []),
          ...toolEvents,
        ];
      }

      case 'thread.created':
        return [
          {
            type: 'trace',
            id: `thread:${event.threadId}`,
            category: 'subagent',
            title: event.title,
            detail: event.agentInfo.input,
            state: 'active',
          },
        ];

      case 'thread.done': {
        if (event.state.status === 'error') {
          const message = redactAndBound(event.state.error);
          return [
            {
              type: 'trace',
              id: `thread:${event.threadId}`,
              category: 'subagent',
              title: `${event.title} failed`,
              detail: message,
              state: 'error',
            },
            {
              type: 'notice',
              id: `thread-error:${event.threadId}`,
              severity: 'error',
              title: `${event.title} failed`,
              message,
            },
          ];
        }
        return [
          {
            type: 'trace',
            id: `thread:${event.threadId}`,
            category: 'subagent',
            title: event.title,
            detail: 'Subagent completed',
            state: 'done',
          },
        ];
      }

      case 'sandbox.created':
        return [
          {
            type: 'trace',
            id: event.id,
            category: 'sandbox',
            title: 'Isolated sandbox provisioned',
            detail: `Sandbox ${event.sandboxId.slice(0, 10)}…`,
            state: 'done',
          },
          { type: 'system', system: 'sandbox', state: 'ready', detail: 'Isolated sandbox provisioned' },
        ];

      case 'tool.response': {
        const call = this.findToolCall(event.toolCallId);
        const presentation = presentationFor(call?.name ?? 'tool_call');
        const errorMessage = toolErrorMessage(event.content);
        if (errorMessage) {
          return [
            {
              type: 'trace',
              id: `tool:${event.toolCallId}`,
              category: 'tool',
              title: presentation.failed,
              detail: errorMessage,
              state: 'error',
            },
            ...(presentation.system
              ? [
                  {
                    type: 'system' as const,
                    system: presentation.system,
                    state: 'error' as const,
                    detail: errorMessage,
                  },
                ]
              : []),
            {
              type: 'notice',
              id: `tool-error:${event.toolCallId}`,
              severity: 'error',
              title: presentation.failed,
              message: errorMessage,
              ...(presentation.system ? { system: presentation.system } : {}),
            },
          ];
        }

        return [
          {
            type: 'trace',
            id: `tool:${event.toolCallId}`,
            category: 'tool',
            title: presentation.completed,
            detail: call ? `Tool · ${call.name}` : `Call ${event.toolCallId.slice(0, 12)}…`,
            state: 'done',
          },
          ...(presentation.system
            ? [
                {
                  type: 'system' as const,
                  system: presentation.system,
                  state: 'ready' as const,
                  detail: presentation.completed,
                },
              ]
            : []),
        ];
      }

      case 'tool.approval_required': {
        const calls: ApprovalCall[] = [];
        for (const reference of event.toolCalls) {
          const source = this.events.get(reference.sourceEventId);
          if (source?.type !== 'model.message') continue;
          const call = source.toolCalls?.find((candidate) => candidate.id === reference.id);
          if (!call) continue;
          calls.push({
            threadId: event.threadId,
            toolCallId: reference.id,
            toolName: call.toolInfo.name,
            ...(call.toolInfo.type === 'mcp' ? { serverName: call.toolInfo.serverName } : {}),
            arguments: call.function.arguments,
          });
        }
        if (calls.length !== event.toolCalls.length || calls.length === 0) {
          return [
            {
              type: 'error',
              message: 'Approval details could not be reconstructed safely. Start a new turn and try again.',
            },
          ];
        }
        return [
          { type: 'status', status: 'paused' },
          {
            type: 'trace',
            id: event.id,
            category: 'harness',
            title: 'Human approval required',
            detail: `${calls.length} external action${calls.length === 1 ? '' : 's'} waiting`,
            state: 'waiting',
          },
          { type: 'approval', calls },
        ];
      }

      case 'tool.response_required': {
        const requests: UserInputRequest[] = [];
        for (const reference of event.toolCalls) {
          const source = this.events.get(reference.sourceEventId);
          if (source?.type !== 'model.message') continue;
          const call = source.toolCalls?.find((candidate) => candidate.id === reference.id);
          if (!call) continue;
          requests.push({
            threadId: event.threadId,
            toolCallId: reference.id,
            toolName: call.toolInfo.name,
            ...userInputPresentation(call.function.arguments),
          });
        }
        if (requests.length !== event.toolCalls.length || requests.length === 0) {
          return [
            {
              type: 'error',
              message: 'The requested user input could not be reconstructed safely. Start a new turn and try again.',
            },
          ];
        }
        return [
          { type: 'status', status: 'paused' },
          {
            type: 'trace',
            id: event.id,
            category: 'harness',
            title: 'Your input is required',
            detail: `${requests.length} question${requests.length === 1 ? '' : 's'} waiting`,
            state: 'waiting',
          },
          { type: 'input_required', requests },
        ];
      }

      case 'model.message.delta':
        if (event.threadId === 'main' && event.content) {
          this.rememberRootPreamble(event.content);
          return [{ type: 'delta', content: event.content }];
        }
        return [];

      case 'turn.done': {
        if (event.state.status === 'error') return [{ type: 'error', message: event.state.message }];
        if (event.state.status === 'cancelled') return [{ type: 'status', status: 'cancelled' }];
        if (event.state.requiredActions.length > 0) return [];

        const metrics = event.state.metrics;
        return [
          { type: 'status', status: 'done' },
          {
            type: 'trace',
            id: 'turn:current',
            category: 'harness',
            title: 'Turn completed',
            detail: 'Session state and audit trail persisted',
            state: 'done',
          },
          ...(metrics
            ? [
                {
                  type: 'metrics' as const,
                  ...(metrics.totalTokens !== undefined ? { totalTokens: metrics.totalTokens } : {}),
                  ...(metrics.totalCostInUsd !== undefined ? { totalCostUsd: metrics.totalCostInUsd } : {}),
                },
              ]
            : []),
        ];
      }

      default:
        return [];
    }
  }
}
