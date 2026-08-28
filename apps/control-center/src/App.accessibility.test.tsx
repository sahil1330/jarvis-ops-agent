// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/api', () => ({
  createSession: vi.fn(),
  getHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    harness: { connected: true, version: 'test' },
    agent: 'jarvis-personal-ops',
    mode: 'live',
  }),
  resolveApproval: vi.fn(),
  resolveToolResponse: vi.fn(),
  runTurn: vi.fn(),
}));

describe('App accessibility', () => {
  it('exposes an understandable idle command center without detectable violations', async () => {
    const { container } = render(<App />);

    await waitFor(() => expect(screen.getAllByText('Ready for command').length).toBeGreaterThan(0));
    expect(screen.getByRole('link', { name: 'Skip to command center' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('textbox', { name: 'Command for Jarvis' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Enter Meta+Enter',
    );
    expect(screen.getAllByText('Available', { selector: '.system-status span' })).toHaveLength(1);
    expect(screen.getAllByText('Not checked', { selector: '.system-status span' })).toHaveLength(4);

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
