const now = Date.now();

export const demoEmails = [
  {
    id: 'demo-mail-client-latest',
    threadId: 'demo-thread-atlas',
    from: 'Ava Chen <ava@atlas.example>',
    subject: 'Atlas demo checklist for 3 PM',
    date: new Date(now - 25 * 60 * 1000).toISOString(),
    snippet: 'One thing to double-check: my 5 MB PDF resume failed yesterday. Please also show recommendations and analytics.',
    unread: true,
  },
  {
    id: 'demo-mail-release',
    threadId: 'demo-thread-release',
    from: 'Build Monitor <ci@jarvis-lab.example>',
    subject: 'Demo build completed',
    date: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    snippet: 'The demo build completed successfully and the existing test suite is green.',
    unread: false,
  },
];

export const demoThreads = {
  'demo-thread-atlas': {
    id: 'demo-thread-atlas',
    messages: [
      {
        id: 'demo-mail-client-earlier',
        from: 'Sahil <sahil@jarvis-lab.example>',
        to: 'Ava Chen <ava@atlas.example>',
        subject: 'Re: Atlas demo checklist for 3 PM',
        date: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
        body: 'I will walk through the candidate flow, recommendations, and the analytics view during the demo.',
      },
      {
        id: 'demo-mail-client-latest',
        from: 'Ava Chen <ava@atlas.example>',
        to: 'Sahil <sahil@jarvis-lab.example>',
        subject: 'Re: Atlas demo checklist for 3 PM',
        date: new Date(now - 25 * 60 * 1000).toISOString(),
        body: 'Perfect. One thing to double-check before 3 PM: my PDF resume is about 5 MB and it failed to upload yesterday. Please also show that job recommendations still work and that analytics events are being captured. If those three things are ready, we are good for the demo.',
      },
    ],
  },
  'demo-thread-release': {
    id: 'demo-thread-release',
    messages: [
      {
        id: 'demo-mail-release',
        from: 'Build Monitor <ci@jarvis-lab.example>',
        to: 'Sahil <sahil@jarvis-lab.example>',
        subject: 'Demo build completed',
        date: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        body: 'The demo build completed successfully and the existing test suite is green. This message does not validate file sizes that are not covered by the current suite.',
      },
    ],
  },
} as const;

export const demoEvents = [
  {
    id: 'demo-event-atlas',
    summary: 'Atlas Product Demo',
    description: 'Client product walkthrough. Verify resume upload, recommendations, and analytics before joining.',
    start: { dateTime: new Date(now + 90 * 60 * 1000).toISOString() },
    end: { dateTime: new Date(now + 150 * 60 * 1000).toISOString() },
    attendees: [{ email: 'ava@atlas.example', responseStatus: 'accepted' }],
    htmlLink: 'https://calendar.google.com/',
  },
];
