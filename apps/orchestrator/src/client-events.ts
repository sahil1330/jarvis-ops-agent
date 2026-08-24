import { isEventDelta, mergeEventDelta, type TrueForgeApi } from '@truefoundry/trueforge-sdk';

export type ApprovalCall = {
  threadId: string;
  toolCallId: string;
  toolName: string;
  serverName?: string;
  arguments: string;
};

export type ClientEvent =
  | { type: 'status'; status: 'connected' | 'running' | 'paused' | 'done' | 'cancelled' }
  | { type: 'trace'; id: string; category: 'harness' | 'connector' | 'sandbox' | 'subagent' | 'tool'; title: string; detail?: string; state: 'active' | 'done' | 'waiting' }
  | { type: 'delta'; content: string }
  | { type: 'approval'; calls: ApprovalCall[] }
  | { type: 'metrics'; totalTokens?: number; totalCostUsd?: number }
  | { type: 'error'; message: string };

type EventIndex = Map<string, TrueForgeApi.TurnStreamingEvent>;

export class SessionEventState {
  readonly events: EventIndex = new Map();

  ingest(event: TrueForgeApi.TurnStreamingEvent): ClientEvent[] {
    if (isEventDelta(event)) {
      const base = this.events.get(event.id);
      if (base) mergeEventDelta(base, event);
    } else {
      this.events.set(event.id, event);
    }

    switch (event.type) {
      case 'turn.created':
        return [
          { type: 'status', status: 'running' },
          {
            type: 'trace',
            id: event.id,
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

      case 'thread.created':
        return [
          {
            type: 'trace',
            id: event.id,
            category: 'subagent',
            title: event.title,
            detail: event.agentInfo.input,
            state: 'active',
          },
        ];

      case 'thread.done':
        return [
          {
            type: 'trace',
            id: event.id,
            category: 'subagent',
            title: event.title,
            detail: 'Subagent completed',
            state: 'done',
          },
        ];

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
        ];

      case 'tool.response':
        return [
          {
            type: 'trace',
            id: event.id,
            category: 'tool',
            title: 'Tool call completed',
            detail: `Call ${event.toolCallId.slice(0, 12)}…`,
            state: 'done',
          },
        ];

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

      case 'model.message.delta':
        return event.threadId === 'main' && event.content ? [{ type: 'delta', content: event.content }] : [];

      case 'turn.done': {
        if (event.state.status === 'error') return [{ type: 'error', message: event.state.message }];
        if (event.state.status === 'cancelled') return [{ type: 'status', status: 'cancelled' }];
        if (event.state.requiredActions.length > 0) return [];

        const metrics = event.state.metrics;
        return [
          { type: 'status', status: 'done' },
          {
            type: 'trace',
            id: event.id,
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
