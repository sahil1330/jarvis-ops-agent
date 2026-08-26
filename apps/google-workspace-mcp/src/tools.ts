import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { env } from './config.js';
import { demoEmails, demoEvents, demoThreads } from './demo-data.js';
import { readableMessageBody, type GmailPart } from './gmail-body.js';
import { googleRequest, sanitizeHeader, toBase64Url } from './google-client.js';
import { assertIncreasingRange } from './time.js';

type GmailMessageList = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};
type GmailThread = { id: string; messages?: GmailMessage[] };

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  htmlLink?: string;
};

type CalendarEventList = { items?: CalendarEvent[] };

const GMAIL_USER = 'me';

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function demoEmailSearch(query: string, maxResults: number) {
  const normalized = query.toLowerCase();
  const requiresUnread = /(?:^|\s)is:unread(?:\s|$)/.test(normalized);
  const terms = normalized
    .replace(/\b(?:is:unread|is:read|newer_than:\S+|older_than:\S+|in:\S+)\b/g, ' ')
    .split(/\s+/)
    .map((term) => term.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);

  return demoEmails
    .filter((email) => !requiresUnread || email.unread)
    .filter((email) => {
      if (terms.length === 0) return true;
      const haystack = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, maxResults);
}

export function registerGoogleWorkspaceTools(server: McpServer): void {
  server.registerTool(
    'search_emails',
    {
      title: 'Search Gmail',
      description: 'Search the user’s real Gmail inbox and return message metadata and snippets. Use get_email_thread when the full conversation is needed.',
      inputSchema: {
        query: z.string().default('is:unread newer_than:7d'),
        maxResults: z.number().int().min(1).max(20).default(10),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ query, maxResults }) => {
      if (env.JARVIS_DEMO_MODE) return textResult(demoEmailSearch(query, maxResults));

      const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
      const list = await googleRequest<GmailMessageList>(
        `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages?${params}`,
      );
      const messages = await Promise.all(
        (list.messages ?? []).map(({ id }) =>
          googleRequest<GmailMessage>(
            `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          ),
        ),
      );
      return textResult(messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        from: header(message, 'From'),
        subject: header(message, 'Subject'),
        date: header(message, 'Date'),
        snippet: message.snippet ?? '',
        unread: message.labelIds?.includes('UNREAD') ?? false,
      })));
    },
  );

  server.registerTool(
    'get_email_thread',
    {
      title: 'Read Gmail thread',
      description: 'Read a bounded Gmail conversation after search_emails identifies a relevant thread. Returns sender, recipient, subject, date and readable body text for each message.',
      inputSchema: {
        threadId: z.string().min(1),
        maxMessages: z.number().int().min(1).max(20).default(10),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ threadId, maxMessages }) => {
      if (env.JARVIS_DEMO_MODE) {
        const thread = demoThreads[threadId as keyof typeof demoThreads];
        if (!thread) return textResult({ id: threadId, messages: [] });
        return textResult({ ...thread, messages: thread.messages.slice(-maxMessages) });
      }

      const thread = await googleRequest<GmailThread>(
        `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/threads/${encodeURIComponent(threadId)}?format=full`,
      );
      const messages = (thread.messages ?? []).slice(-maxMessages).map((message) => ({
        id: message.id,
        threadId: message.threadId,
        from: header(message, 'From'),
        to: header(message, 'To'),
        subject: header(message, 'Subject'),
        date: header(message, 'Date'),
        body: readableMessageBody(message.payload, message.snippet ?? ''),
      }));
      return textResult({ id: thread.id, messages });
    },
  );

  server.registerTool(
    'list_calendar_events',
    {
      title: 'Read calendar',
      description: 'List real Google Calendar events within a time window.',
      inputSchema: {
        timeMin: z.string().datetime(),
        timeMax: z.string().datetime(),
        calendarId: z.string().default('primary'),
        maxResults: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ timeMin, timeMax, calendarId, maxResults }) => {
      assertIncreasingRange(timeMin, timeMax, 'timeMin', 'timeMax');
      if (env.JARVIS_DEMO_MODE) return textResult(demoEvents.slice(0, maxResults));
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: String(maxResults),
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      const result = await googleRequest<CalendarEventList>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      return textResult(result.items ?? []);
    },
  );

  server.registerTool(
    'send_email',
    {
      title: 'Send email',
      description: 'Send an email from the connected Gmail account. This is an external side effect.',
      inputSchema: {
        to: z.array(z.string().email()).min(1).max(20),
        subject: z.string().min(1).max(998),
        body: z.string().min(1).max(50_000),
        cc: z.array(z.string().email()).max(20).default([]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ to, subject, body, cc }) => {
      if (env.JARVIS_DEMO_MODE) return textResult({ mode: 'demo', sent: true, to, cc, subject });
      const lines = [
        `To: ${to.map(sanitizeHeader).join(', ')}`,
        ...(cc.length ? [`Cc: ${cc.map(sanitizeHeader).join(', ')}`] : []),
        `Subject: ${sanitizeHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body,
      ];
      const result = await googleRequest<{ id: string; threadId: string }>(
        `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/send`,
        { method: 'POST', body: JSON.stringify({ raw: toBase64Url(lines.join('\r\n')) }) },
      );
      return textResult({ sent: true, messageId: result.id, threadId: result.threadId });
    },
  );

  server.registerTool(
    'move_calendar_event',
    {
      title: 'Move calendar event',
      description: 'Change the start and end time of an existing Google Calendar event.',
      inputSchema: {
        eventId: z.string().min(1),
        newStart: z.string().datetime(),
        newEnd: z.string().datetime(),
        calendarId: z.string().default('primary'),
        notifyAttendees: z.boolean().default(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ eventId, newStart, newEnd, calendarId, notifyAttendees }) => {
      assertIncreasingRange(newStart, newEnd, 'newStart', 'newEnd');
      if (env.JARVIS_DEMO_MODE) return textResult({ mode: 'demo', moved: true, eventId, newStart, newEnd });
      const params = new URLSearchParams({ sendUpdates: notifyAttendees ? 'all' : 'none' });
      const result = await googleRequest<CalendarEvent>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ start: { dateTime: newStart }, end: { dateTime: newEnd } }),
        },
      );
      return textResult({ moved: true, event: result });
    },
  );
}
