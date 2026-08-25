// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createSession, runTurn } from './lib/api';

vi.mock('./lib/api', () => ({
  createSession: vi.fn(),
  getHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    harness: { connected: true, version: 'test' },
    agent: 'jarvis-personal-ops',
    mode: 'live',
  }),
  resolveApproval: vi.fn(),
  runTurn: vi.fn(),
}));

describe('App live feedback', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(createSession).mockReset().mockResolvedValue('session-1');
    vi.mocked(runTurn).mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps a Gmail failure and the eventual response visible in the outcome panel', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({ type: 'system', system: 'gmail', state: 'active', detail: 'Searching Gmail' });
      onEvent({
        type: 'notice',
        id: 'tool-error:search-1',
        severity: 'error',
        title: 'Gmail search failed',
        message: 'Google API error: invalid_grant',
        system: 'gmail',
      });
      onEvent({ type: 'system', system: 'gmail', state: 'error', detail: 'Google API error: invalid_grant' });
      onEvent({ type: 'delta', content: 'I could not read Gmail. Reconnect Google and try again.' });
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    const composer = screen.getByRole('textbox', { name: 'Command for Jarvis' });
    fireEvent.change(composer, { target: { value: 'Check my urgent email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent('Gmail search failed');
    expect(failure).toHaveTextContent('invalid_grant');
    expect(screen.getByText(/Jarvis response: I could not read Gmail/i)).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByText('Failed', { selector: '.system-status span' })).toBeVisible();
    expect(screen.getAllByText('Completed with issues').length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement).toBe(failure));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it('does not evict a system failure when unrelated notices arrive', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      for (let index = 0; index < 5; index += 1) {
        onEvent({
          type: 'notice',
          id: `warning-${index}`,
          severity: 'warning',
          title: `Agent warning ${index + 1}`,
          message: 'Non-system diagnostic notice',
        });
      }
      onEvent({
        type: 'notice',
        id: 'tool-error:search-1',
        severity: 'error',
        title: 'Gmail search failed',
        message: 'Google API error: invalid_grant',
        system: 'gmail',
      });
      onEvent({ type: 'system', system: 'gmail', state: 'error', detail: 'Google API error: invalid_grant' });
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Check my urgent email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    const failureTitle = await screen.findByText('Gmail search failed');
    expect(failureTitle).toBeVisible();
    const failure = failureTitle.closest('[role="alert"]');
    expect(failure).not.toBeNull();
    expect(screen.getAllByText('Completed with issues').length).toBeGreaterThan(0);
    expect(screen.getByText('Failed', { selector: '.system-status span' })).toBeVisible();
    await waitFor(() => expect(document.activeElement).toBe(failure));
  });
});
