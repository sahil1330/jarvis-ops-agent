import { describe, expect, it } from 'vitest';
import { demoThreads } from './demo-data.js';
import { MAX_THREAD_BODY_CHARACTERS, readableMessageBody, type GmailPart } from './gmail-body.js';

function encoded(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('Gmail thread retrieval', () => {
  it('prefers plain text in multipart alternatives', () => {
    const payload: GmailPart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: encoded('<p>HTML requirement</p>') } },
        { mimeType: 'text/plain', body: { data: encoded('Plain requirement') } },
      ],
    };
    expect(readableMessageBody(payload, 'snippet')).toBe('Plain requirement');
  });

  it('converts HTML-only bodies into readable bounded text', () => {
    const payload: GmailPart = {
      mimeType: 'text/html',
      body: { data: encoded('<p>Verify <strong>5 MB</strong> resumes.</p><p>Check analytics.</p>') },
    };
    expect(readableMessageBody(payload, 'short snippet')).toBe('Verify 5 MB resumes.\nCheck analytics.');
  });

  it('bounds decoded body output even for oversized source payloads', () => {
    const payload: GmailPart = {
      mimeType: 'text/plain',
      body: { data: encoded('x'.repeat(MAX_THREAD_BODY_CHARACTERS * 4)) },
    };
    expect(readableMessageBody(payload)).toHaveLength(MAX_THREAD_BODY_CHARACTERS);
  });

  it('keeps the golden mission requirements deterministic in demo data', () => {
    const thread = demoThreads['demo-thread-atlas'];
    const body = thread.messages.map((message) => message.body).join(' ');
    expect(body).toContain('5 MB');
    expect(body).toContain('job recommendations');
    expect(body).toContain('analytics events');
  });
});
