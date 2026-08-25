// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard } from './ApprovalCard';

describe('ApprovalCard', () => {
  it('shows the exact side effect and returns the user decision', () => {
    const onDecision = vi.fn();
    render(
      <ApprovalCard
        busy={false}
        onDecision={onDecision}
        calls={[
          {
            threadId: 'main',
            toolCallId: 'call-1',
            toolName: 'send_email',
            serverName: 'jarvis-google-workspace',
            arguments: JSON.stringify({ to: ['ava@example.com'], subject: 'Running late' }),
          },
        ]}
      />,
    );

    expect(screen.getByText('Permission required')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Permission required' })).toHaveFocus();
    expect(screen.getByText('ava@example.com')).toBeTruthy();
    expect(screen.getByText('Running late')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /approve action/i }));
    expect(onDecision).toHaveBeenCalledWith('allow');
  });

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = render(
      <ApprovalCard
        busy={false}
        onDecision={vi.fn()}
        calls={[
          {
            threadId: 'main',
            toolCallId: 'call-1',
            toolName: 'move_calendar_event',
            serverName: 'jarvis-google-workspace',
            arguments: JSON.stringify({ eventId: 'event-1', newStart: '2026-08-25T10:00:00Z' }),
          },
        ]}
      />,
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
