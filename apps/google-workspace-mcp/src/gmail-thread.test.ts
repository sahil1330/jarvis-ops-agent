import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demoThreads } from './demo-data.js';

describe('Gmail thread retrieval', () => {
  it('uses the authenticated mailbox and the Gmail threads endpoint', async () => {
    const source = await readFile(fileURLToPath(new URL('./tools.ts', import.meta.url)), 'utf8');
    expect(source).toContain("'get_email_thread'");
    expect(source).toContain('/gmail/v1/users/${GMAIL_USER}/threads/${encodeURIComponent(threadId)}?format=full');
    expect(source).toContain('MAX_THREAD_BODY_CHARACTERS');
  });

  it('keeps the golden mission requirements deterministic in demo data', () => {
    const thread = demoThreads['demo-thread-atlas'];
    const body = thread.messages.map((message) => message.body).join(' ');
    expect(body).toContain('5 MB');
    expect(body).toContain('job recommendations');
    expect(body).toContain('analytics events');
  });
});
