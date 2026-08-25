// @vitest-environment jsdom
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
    expect(screen.getByText('ava@example.com')).toBeTruthy();
    expect(screen.getByText('Running late')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /approve action/i }));
    expect(onDecision).toHaveBeenCalledWith('allow');
  });
});
