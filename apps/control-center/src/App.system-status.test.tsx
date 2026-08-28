// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/api', () => ({
  createSession: vi.fn(),
  getHealth: vi.fn(() => new Promise(() => undefined)),
  resolveApproval: vi.fn(),
  resolveToolResponse: vi.fn(),
  runTurn: vi.fn(),
}));

describe('App system status', () => {
  it('distinguishes a running harness check from tools that have not been used', () => {
    render(<App />);

    const systems = screen.getByRole('complementary', { name: 'Connected systems' });
    (systems.closest('details') as HTMLDetailsElement).open = true;
    expect(within(systems).getByText('Checking', { selector: '.system-status span' })).toBeVisible();
    expect(within(systems).getAllByText('Not checked', { selector: '.system-status span' })).toHaveLength(4);
    expect(within(systems).getByText('GitHub')).toBeVisible();
  });
});
