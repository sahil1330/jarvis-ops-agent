import { timingSafeEqual } from 'node:crypto';

export function bearerTokenMatches(header: string | undefined, expectedToken: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
