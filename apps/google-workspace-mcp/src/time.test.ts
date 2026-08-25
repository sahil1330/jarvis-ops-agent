import { describe, expect, it } from 'vitest';
import { assertIncreasingRange } from './time.js';

describe('calendar range validation', () => {
  it('rejects reversed or empty time windows', () => {
    expect(() => assertIncreasingRange('2026-08-25T11:00:00.000Z', '2026-08-25T10:00:00.000Z', 'timeMin', 'timeMax')).toThrow(
      'timeMax must be later than timeMin',
    );
  });
});
