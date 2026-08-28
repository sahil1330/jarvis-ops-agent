// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserInputCard } from './UserInputCard';

afterEach(cleanup);

const request = {
  threadId: 'main',
  toolCallId: 'question-1',
  toolName: 'ask_user_question',
  question: 'What should I use to identify the demo?',
  options: ['Use the client name', 'Proceed with a generic checklist'],
};

describe('UserInputCard', () => {
  it('makes a TrueForge pause visible and returns the selected answer', () => {
    const onSubmit = vi.fn();
    render(<UserInputCard requests={[request]} busy={false} onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Jarvis needs your input' })).toHaveFocus();
    expect(screen.getByText('YOUR DECISION')).toBeVisible();
    const submit = screen.getByRole('button', { name: /continue/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Use the client name' }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith([{ toolCallId: 'question-1', content: 'Use the client name' }]);
  });

  it('supports a custom answer', () => {
    const onSubmit = vi.fn();
    render(<UserInputCard requests={[request]} busy={false} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'The client is Acme.' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ toolCallId: 'question-1', content: 'The client is Acme.' }]);
  });

  it('makes the checkpoint a visible voice conversation', () => {
    const onToggle = vi.fn();
    render(
      <UserInputCard
        requests={[request]}
        busy={false}
        onSubmit={vi.fn()}
        voice={{
          supported: true,
          listening: false,
          transcribing: false,
          autoStopsOnSilence: true,
          error: '',
          transcript: 'use the client name',
          onToggle,
        }}
      />,
    );

    expect(screen.getByText('“use the client name”')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Answer Jarvis by voice' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = render(<UserInputCard requests={[request]} busy={false} onSubmit={vi.fn()} />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
