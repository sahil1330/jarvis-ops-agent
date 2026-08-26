// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createSession, resolveApproval, runTurn } from './lib/api';
import { persistPausedCheckpoint } from './lib/session-resume';

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

describe('App GitHub system feedback', () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  beforeEach(() => {
    vi.mocked(createSession).mockReset().mockResolvedValue('session-github');
    vi.mocked(resolveApproval).mockReset();
    vi.mocked(runTurn).mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('marks GitHub failed and the turn completed with issues when repository inspection fails', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({
        type: 'trace',
        id: 'tool:repo-1',
        category: 'tool',
        title: 'Get Repository Snapshot in progress',
        detail: 'MCP · jarvis-github-ops',
        state: 'active',
      });
      onEvent({
        type: 'trace',
        id: 'tool:repo-1',
        category: 'tool',
        title: 'Get Repository Snapshot failed',
        detail: 'GitHub API 403: resource not accessible',
        state: 'error',
      });
      onEvent({ type: 'delta', content: 'I could not inspect the demo repository.' });
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Make sure I am ready for the demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    await waitFor(() => expect(vi.mocked(runTurn)).toHaveBeenCalledTimes(1));
    const systems = screen.getByRole('complementary', { name: 'Connected systems' });
    const github = within(systems).getByText('GitHub').closest('div');
    expect(github).not.toBeNull();
    expect(within(github as HTMLElement).getByText('Failed')).toBeVisible();
    expect(screen.getAllByText('Completed with issues').length).toBeGreaterThan(0);
  });

  it('moves GitHub from working to available when the repository snapshot completes', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({
        type: 'trace',
        id: 'tool:repo-2',
        category: 'tool',
        title: 'Get Repository Snapshot in progress',
        detail: 'MCP · jarvis-github-ops',
        state: 'active',
      });
      onEvent({
        type: 'trace',
        id: 'tool:repo-2',
        category: 'tool',
        title: 'Get Repository Snapshot completed',
        detail: 'Tool · get_repository_snapshot',
        state: 'done',
      });
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Check the demo repository' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    await waitFor(() => expect(vi.mocked(runTurn)).toHaveBeenCalledTimes(1));
    const systems = screen.getByRole('complementary', { name: 'Connected systems' });
    const github = within(systems).getByText('GitHub').closest('div');
    expect(within(github as HTMLElement).getByText('Available')).toBeVisible();
  });

  it('hydrates a restored GitHub failure into app issue state and keeps it through approval resume', async () => {
    persistPausedCheckpoint({
      sessionId: 'session-restored',
      response: 'A verified repair is ready to publish.',
      approvals: [{
        threadId: 'main',
        toolCallId: 'call-publish',
        toolName: 'publish_verified_fix',
        arguments: '{"baseSha":"abc"}',
      }],
      trace: [{
        id: 'tool:repo-restored',
        category: 'tool',
        title: 'Get Repository Snapshot failed',
        detail: 'GitHub API 403: restored failure',
        state: 'error',
        timestamp: 30,
      }],
    });

    vi.mocked(resolveApproval).mockImplementation(async (_sessionId, _decisions, onEvent, _signal, onAccepted) => {
      onAccepted?.();
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    await screen.findByText('Approval restored');

    const systems = screen.getByRole('complementary', { name: 'Connected systems' });
    const github = within(systems).getByText('GitHub').closest('div');
    expect(within(github as HTMLElement).getByText('Failed')).toBeVisible();
    expect(document.querySelector('.status-pill')).toHaveClass('has-issues');

    fireEvent.click(screen.getByRole('button', { name: 'Approve action' }));
    await waitFor(() => expect(vi.mocked(resolveApproval)).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Completed with issues').length).toBeGreaterThan(0));
    expect(within(github as HTMLElement).getByText('Failed')).toBeVisible();
  });
});
