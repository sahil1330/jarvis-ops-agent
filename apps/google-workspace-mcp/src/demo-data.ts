export const demoEmails = [
  {
    id: 'demo-mail-1',
    threadId: 'demo-thread-1',
    from: 'Ava Chen <ava@example.com>',
    subject: 'Client review moved forward',
    date: new Date().toISOString(),
    snippet: 'Can we start the review 45 minutes earlier today?',
    unread: true,
  },
  {
    id: 'demo-mail-2',
    threadId: 'demo-thread-2',
    from: 'Build Monitor <ci@example.com>',
    subject: 'Production deployment completed',
    date: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
    snippet: 'The release completed successfully. No action is required.',
    unread: true,
  },
];

export const demoEvents = [
  {
    id: 'demo-event-1',
    summary: 'Client design review',
    start: { dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    end: { dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
    attendees: [{ email: 'ava@example.com', responseStatus: 'accepted' }],
    htmlLink: 'https://calendar.google.com/',
  },
];
