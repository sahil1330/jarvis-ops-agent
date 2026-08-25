import { describe, expect, it } from 'vitest';
import { consumeSpeechSegments } from './speech-segments';

describe('consumeSpeechSegments', () => {
  it('emits complete sentences while retaining an unfinished tail', () => {
    const result = consumeSpeechSegments('', 'I checked your calendar. One meeting is affected');
    expect(result.segments).toEqual(['I checked your calendar.']);
    expect(result.rest).toBe(' One meeting is affected');
  });

  it('continues a sentence across streamed deltas', () => {
    const first = consumeSpeechSegments('', 'I found one affected');
    const second = consumeSpeechSegments(first.rest, ' meeting. I am preparing the change.');
    expect(second.segments).toEqual(['I found one affected meeting.', 'I am preparing the change.']);
    expect(second.rest).toBe('');
  });

  it('flushes the final unfinished phrase when a turn pauses or completes', () => {
    const result = consumeSpeechSegments('', 'I need your approval before I continue', true);
    expect(result.segments).toEqual(['I need your approval before I continue']);
    expect(result.rest).toBe('');
  });

  it('does not wait forever for punctuation in a long response', () => {
    const text = `${'This is a streamed assistant response '.repeat(12)}and it keeps going`;
    const result = consumeSpeechSegments('', text);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments[0].length).toBeLessThanOrEqual(320);
  });

  it('removes common markdown noise before speech', () => {
    const result = consumeSpeechSegments('', '**Done.** [Open calendar](https://example.com).');
    expect(result.segments).toEqual(['Done.', 'Open calendar.']);
  });

  it('keeps colons and semicolons inside the same natural sentence', () => {
    const result = consumeSpeechSegments('', 'I found two things: one meeting conflict; one urgent email.');
    expect(result.segments).toEqual(['I found two things: one meeting conflict; one urgent email.']);
  });
});
