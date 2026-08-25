import { describe, expect, it } from 'vitest';
import { RealtimePlayoutBuffer } from './realtime-playout-buffer';

function samples(values: number[]): Float32Array {
  return Float32Array.from(values);
}

describe('RealtimePlayoutBuffer', () => {
  it('holds audio until the lookahead is ready', () => {
    const buffer = new RealtimePlayoutBuffer(1_000, { lookaheadMs: 4, audibleRms: 0.01 });
    buffer.push(samples([0.5, 0.5, 0.5]));
    expect([...buffer.pull(2)]).toEqual([0, 0]);

    buffer.push(samples([0.5]));
    expect([...buffer.pull(4)]).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('removes leading and between-response transport silence', () => {
    const buffer = new RealtimePlayoutBuffer(1_000, {
      lookaheadMs: 20,
      boundarySilenceMs: 3,
      audibleRms: 0.01,
    });
    buffer.push(samples([0, 0, 0]));
    buffer.push(samples([0.25, 0.25]));
    buffer.push(samples([0, 0]));
    buffer.markResponseBoundary();
    buffer.push(samples([0, 0, 0, 0]));
    buffer.push(samples([0.75, 0.75]));

    expect([...buffer.pull(4)]).toEqual([0.25, 0.25, 0.75, 0.75]);
  });

  it('forces a short completed response to start without filling the lookahead', () => {
    const buffer = new RealtimePlayoutBuffer(1_000, { lookaheadMs: 20, audibleRms: 0.01 });
    buffer.push(samples([0.4, 0.4]));
    buffer.markResponseBoundary();
    expect([...buffer.pull(2)]).toEqual([expect.closeTo(0.4), expect.closeTo(0.4)]);
  });

  it('clears queued audio when playback is stopped', () => {
    const buffer = new RealtimePlayoutBuffer(1_000, { lookaheadMs: 1, audibleRms: 0.01 });
    buffer.push(samples([0.5, 0.5]));
    buffer.reset();
    expect([...buffer.pull(2)]).toEqual([0, 0]);
  });
});
