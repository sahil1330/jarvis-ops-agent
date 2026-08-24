import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { describe, expect, it } from 'vitest';
import { SessionEventState } from './client-events.js';

describe('SessionEventState', () => {
  it('resolves approval references to the real tool name and arguments', () => {
    const state = new SessionEventState();
    state.ingest({
      type: 'model.message',
      id: 'message-1',
      threadId: 'main',
      createdAt: new Date().toISOString(),
      content: null,
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'send_email', arguments: '{"to":["ava@example.com"]}' },
          toolInfo: {
            type: 'mcp',
            name: 'send_email',
            serverId: 'server-1',
            serverName: 'jarvis-google-workspace',
          },
        },
      ],
    } as TrueForgeApi.TurnStreamingEvent);

    const events = state.ingest({
      type: 'tool.approval_required',
      id: 'approval-1',
      threadId: 'main',
      createdAt: new Date().toISOString(),
      toolCalls: [{ id: 'call-1', sourceEventId: 'message-1' }],
    } as TrueForgeApi.TurnStreamingEvent);

    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toEqual({
      type: 'approval',
      calls: [
        {
          threadId: 'main',
          toolCallId: 'call-1',
          toolName: 'send_email',
          serverName: 'jarvis-google-workspace',
          arguments: '{"to":["ava@example.com"]}',
        },
      ],
    });
  });

  it('only forwards root-agent text deltas', () => {
    const state = new SessionEventState();
    expect(
      state.ingest({
        type: 'model.message.delta',
        id: 'delta-1',
        threadId: 'main',
        content: 'Ready.',
      } as TrueForgeApi.TurnStreamingEvent),
    ).toEqual([{ type: 'delta', content: 'Ready.' }]);

    expect(
      state.ingest({
        type: 'model.message.delta',
        id: 'delta-2',
        threadId: 'subagent-1',
        content: 'Internal analysis',
      } as TrueForgeApi.TurnStreamingEvent),
    ).toEqual([]);
  });
});
