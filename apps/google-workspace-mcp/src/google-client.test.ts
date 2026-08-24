import { describe, expect, it } from 'vitest';
import { sanitizeHeader, toBase64Url } from './google-client.js';

describe('Google message safety helpers', () => {
  it('prevents mail header injection', () => {
    expect(sanitizeHeader('Hello\r\nBcc: attacker@example.com')).toBe('Hello Bcc: attacker@example.com');
  });

  it('encodes RFC 2822 content as URL-safe base64', () => {
    const encoded = toBase64Url('Subject: Hello ✓');
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toBe('Subject: Hello ✓');
  });
});
