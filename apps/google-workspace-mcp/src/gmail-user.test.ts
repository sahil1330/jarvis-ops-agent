import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('personal Gmail addressing', () => {
  it('uses the authenticated OAuth mailbox instead of a configurable delegated mailbox', async () => {
    const source = await readFile(fileURLToPath(new URL('./tools.ts', import.meta.url)), 'utf8');
    expect(source).toContain("const GMAIL_USER = 'me';");
    expect(source).not.toContain('GOOGLE_USER_EMAIL');
    expect(source).toContain('/gmail/v1/users/${GMAIL_USER}/messages');
  });
});
