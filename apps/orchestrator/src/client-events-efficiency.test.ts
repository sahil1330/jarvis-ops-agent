import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { describe, expect, it } from 'vitest';
import { SessionEventState } from './client-events.js';

function readMessage(
  id: string,
  threadId: string,
  toolName: 'search_emails' | 'list_calendar_events',
): TrueForgeApi.TurnStreamingEvent {
  return {
    type: 'model.message',
    id,
    threadId,
    createdAt: new Date().toISOString(),
    content: null,
    toolCalls: [
      {
        id: `${id}-call`,
        type: 'function',
        function: { name: toolName, arguments: '{}' },
        toolInfo: {
          type: 'mcp',
          name: toolName,
          serverId: 'server-1',
          serverName: 'jarvis-google-workspace',
        },
      },
    ],
  } as TrueForgeApi.TurnStreamingEvent;
}

function hasNarration(events: ReturnType<SessionEventState['ingest']>): boolean {
  return events.some((event) => event.type === 'narration');
}

describe('SessionEventState conversational efficiency', () => {
  it('keeps a root calendar+inbox preamble across unrelated subagent responses', () => {
    const state = new SessionEventState();
    state.ingest({
      type: 'model.message.delta',
      id: 'root-preamble',
      threadId: 'main',
      content: "I'll check your calendar and inbox in parallel.",
    } as TrueForgeApi.TurnStreamingEvent);

    // An unrelated subagent result may interleave before the delegated reads start.
    state.ingest({
      type: 'tool.response',
      id: 'unrelated-response',
      threadId: 'subagent-other',
      toolCallId: 'unrelated-call',
      createdAt: new Date().toISOString(),
      content: JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
    } as TrueForgeApi.TurnStreamingEvent);

    expect(hasNarration(state.ingest(readMessage('calendar-read', 'calendar-agent', 'list_calendar_events')))).toBe(false);
    expect(hasNarration(state.ingest(readMessage('gmail-read', 'mail-agent', 'search_emails')))).toBe(false);
  });

  it('narrates a later system that was not covered by the root preamble', () => {
    const state = new SessionEventState();
    state.ingest({
      type: 'model.message.delta',
      id: 'calendar-only-preamble',
      threadId: 'main',
      content: "I'll check your calendar now.",
    } as TrueForgeApi.TurnStreamingEvent);

    expect(hasNarration(state.ingest(readMessage('calendar-read', 'calendar-agent', 'list_calendar_events')))).toBe(false);
    expect(state.ingest(readMessage('gmail-read', 'mail-agent', 'search_emails'))).toContainEqual({
      type: 'narration',
      id: 'tool-narration:gmail-read',
      content: "I'll check your inbox now.",
    });
  });

  it('does not mistake a reported result for a future-action preamble', () => {
    const state = new SessionEventState();
    state.ingest({
      type: 'model.message.delta',
      id: 'result-text',
      threadId: 'main',
      content: 'Your calendar has one meeting tomorrow.',
    } as TrueForgeApi.TurnStreamingEvent);

    expect(state.ingest(readMessage('calendar-read', 'calendar-agent', 'list_calendar_events'))).toContainEqual({
      type: 'narration',
      id: 'tool-narration:calendar-read',
      content: "I'll check your calendar now.",
    });
  });
});
