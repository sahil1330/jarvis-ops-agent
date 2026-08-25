import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { describe, expect, it } from 'vitest';
import { SessionEventState } from './client-events.js';

describe('SessionEventState', () => {
  function rememberGmailSearch(state: SessionEventState): void {
    state.ingest({
      type: 'model.message',
      id: 'message-gmail-search',
      threadId: 'main',
      createdAt: new Date().toISOString(),
      content: null,
      toolCalls: [
        {
          id: 'call-gmail-search',
          type: 'function',
          function: { name: 'search_emails', arguments: '{"query":"is:unread"}' },
          toolInfo: {
            type: 'mcp',
            name: 'search_emails',
            serverId: 'server-1',
            serverName: 'jarvis-google-workspace',
          },
        },
      ],
    } as TrueForgeApi.TurnStreamingEvent);
  }

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

  it('fails safely when approval call details cannot be reconstructed', () => {
    const state = new SessionEventState();
    const events = state.ingest({
      type: 'tool.approval_required',
      id: 'approval-missing-source',
      threadId: 'main',
      createdAt: new Date().toISOString(),
      toolCalls: [{ id: 'call-1', sourceEventId: 'missing-message' }],
    } as TrueForgeApi.TurnStreamingEvent);

    expect(events).toEqual([
      {
        type: 'error',
        message: 'Approval details could not be reconstructed safely. Start a new turn and try again.',
      },
    ]);
    expect(events.some((event) => event.type === 'approval')).toBe(false);
  });

  it('surfaces a failed Gmail tool response as an error instead of a completion', () => {
    const state = new SessionEventState();
    rememberGmailSearch(state);

    const events = state.ingest({
      type: 'tool.response',
      id: 'response-gmail-failed',
      threadId: 'main',
      toolCallId: 'call-gmail-search',
      createdAt: new Date().toISOString(),
      content: JSON.stringify({
        content: [{ type: 'text', text: 'Google API error: invalid_grant' }],
        isError: true,
      }),
    } as TrueForgeApi.TurnStreamingEvent);

    expect(events).toContainEqual({
      type: 'trace',
      id: 'tool:call-gmail-search',
      category: 'tool',
      title: 'Gmail search failed',
      detail: 'Google API error: invalid_grant',
      state: 'error',
    });
    expect(events).toContainEqual({
      type: 'system',
      system: 'gmail',
      state: 'error',
      detail: 'Google API error: invalid_grant',
    });
    expect(events).toContainEqual({
      type: 'notice',
      id: 'tool-error:call-gmail-search',
      severity: 'error',
      title: 'Gmail search failed',
      message: 'Google API error: invalid_grant',
      system: 'gmail',
    });
    expect(events.some((event) => event.type === 'trace' && event.state === 'done')).toBe(false);
  });

  it('returns Gmail to available after a successful tool response', () => {
    const state = new SessionEventState();
    const started = state.ingest({
      type: 'model.message',
      id: 'message-gmail-search',
      threadId: 'main',
      createdAt: new Date().toISOString(),
      content: null,
      toolCalls: [
        {
          id: 'call-gmail-search',
          type: 'function',
          function: { name: 'search_emails', arguments: '{"query":"is:unread"}' },
          toolInfo: {
            type: 'mcp',
            name: 'search_emails',
            serverId: 'server-1',
            serverName: 'jarvis-google-workspace',
          },
        },
      ],
    } as TrueForgeApi.TurnStreamingEvent);

    expect(started).toContainEqual({
      type: 'system',
      system: 'gmail',
      state: 'active',
      detail: 'Searching Gmail',
    });

    const completed = state.ingest({
      type: 'tool.response',
      id: 'response-gmail-complete',
      threadId: 'main',
      toolCallId: 'call-gmail-search',
      createdAt: new Date().toISOString(),
      content: JSON.stringify({ content: [{ type: 'text', text: '[]' }] }),
    } as TrueForgeApi.TurnStreamingEvent);

    expect(completed).toContainEqual({
      type: 'system',
      system: 'gmail',
      state: 'ready',
      detail: 'Gmail search completed',
    });
  });
});
