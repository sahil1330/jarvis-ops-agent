import { describe, expect, it } from 'vitest';
import { deriveMissionStageState } from './ExecutionTrace';
import type { TraceItem } from '../types';

const stage = {
  id: 'verify' as const,
  label: 'Verify',
  hint: 'Repository + sandbox',
  matches: (item: TraceItem) => item.category === 'sandbox' || /repository/i.test(item.title),
};

function item(overrides: Partial<TraceItem>): TraceItem {
  return {
    id: 'trace-1',
    category: 'tool',
    title: 'Inspect repository',
    state: 'active',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('mission stage derivation', () => {
  it('is pending before matching evidence exists', () => {
    expect(deriveMissionStageState(stage, [], 'running')).toBe('pending');
  });

  it('tracks active and completed matching evidence', () => {
    expect(deriveMissionStageState(stage, [item({ state: 'active' })], 'running')).toBe('active');
    expect(deriveMissionStageState(stage, [item({ state: 'done' })], 'running')).toBe('done');
  });

  it('keeps failed verification visibly failed', () => {
    expect(deriveMissionStageState(stage, [item({ state: 'error' })], 'error')).toBe('error');
  });
});
