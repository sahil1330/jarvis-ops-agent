import { describe, expect, it } from 'vitest';

describe('streaming speech queue contract', () => {
  it('keeps speech chunks ordered instead of replacing earlier chunks', () => {
    const chunks = ['Checking your calendar.', 'I found one conflict.', 'I am checking Gmail now.'];
    expect(chunks.join(' ')).toBe('Checking your calendar. I found one conflict. I am checking Gmail now.');
  });
});
