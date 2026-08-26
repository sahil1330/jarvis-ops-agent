import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionTrace } from './ExecutionTrace';
import type { AgentPhase, TraceItem } from '../types';

function item(id: string, title: string, state: TraceItem['state'], overrides: Partial<TraceItem> = {}): TraceItem {
  return {
    id,
    category: 'tool',
    title,
    state,
    timestamp: Date.now(),
    ...overrides,
  };
}

function stageState(label: string): string | null | undefined {
  const labelNode = screen.getByText(label, { selector: '.mission-stage-copy strong' });
  return labelNode.closest('.mission-stage')?.querySelector('.mission-stage-state')?.textContent;
}

function renderTrace(items: TraceItem[], phase: AgentPhase = 'running') {
  return render(<ExecutionTrace items={items} phase={phase} />);
}

afterEach(cleanup);

describe('evidence-backed mission stages', () => {
  it('does not treat sandbox provisioning as completed verification', () => {
    renderTrace([
      item('sandbox-1', 'Isolated sandbox provisioned', 'done', { category: 'sandbox' }),
    ]);
    expect(stageState('Verify')).toBe('active');
  });

  it('completes verification only after repository evidence, sandbox use, and action progression', () => {
    const evidence = [
      item('repo', 'Get Repository Snapshot completed', 'done', { detail: 'Tool · get_repository_snapshot' }),
      item('sandbox', 'Isolated sandbox provisioned', 'done', { category: 'sandbox' }),
    ];
    const view = renderTrace(evidence);
    expect(stageState('Verify')).toBe('active');

    view.rerender(<ExecutionTrace
      items={[...evidence, item('publish', 'Publish Verified Fix in progress', 'active')]}
      phase="running"
    />);
    expect(stageState('Verify')).toBe('done');
  });

  it('uses calendar reads for Context and ignores calendar writes', () => {
    const view = renderTrace([item('move', 'Calendar change completed', 'done', { detail: 'Tool · move_calendar_event' })]);
    expect(stageState('Context')).toBe('pending');

    view.rerender(<ExecutionTrace
      items={[item('read', 'Calendar check completed', 'done', { detail: 'Tool · list_calendar_events' })]}
      phase="running"
    />);
    expect(stageState('Context')).toBe('done');
  });

  it('uses Gmail reads for Requirements and ignores outbound email actions', () => {
    const view = renderTrace([item('send', 'Gmail action completed', 'done', { detail: 'Tool · send_email' })]);
    expect(stageState('Requirements')).toBe('pending');

    view.rerender(<ExecutionTrace
      items={[item('thread', 'Get Email Thread completed', 'done', { detail: 'Tool · get_email_thread' })]}
      phase="running"
    />);
    expect(stageState('Requirements')).toBe('done');
  });

  it('recognizes completed calendar moves as Action even when an old approval trace remains waiting', () => {
    renderTrace([
      item('approval', 'Human approval required', 'waiting', { category: 'harness' }),
      item('move', 'Calendar change completed', 'done', { detail: 'Tool · move_calendar_event' }),
    ], 'running');
    expect(stageState('Action')).toBe('done');
  });

  it('shows the Action stage active while the harness is paused for approval', () => {
    renderTrace([item('publish', 'Publish Verified Fix in progress', 'active')], 'paused');
    expect(stageState('Action')).toBe('active');
  });
});
