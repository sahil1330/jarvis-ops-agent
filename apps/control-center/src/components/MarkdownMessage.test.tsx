// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownMessage } from './MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renders structured Markdown instead of showing its source syntax', () => {
    render(
      <MarkdownMessage content={'## Demo readiness\n\n- Calendar checked\n- Email found\n\nRun `npm test` and read the [brief](https://example.com/brief).'} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Demo readiness' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('npm test', { selector: 'code' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'brief' })).toHaveAttribute('href', 'https://example.com/brief');
    expect(screen.getByRole('link', { name: 'brief' })).toHaveAttribute('target', '_blank');
  });

  it('does not render raw HTML or remote images from agent output', () => {
    const { container } = render(
      <MarkdownMessage content={'Before <script>alert(1)</script> after\n\n![tracker](https://example.com/pixel.gif)'} />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Before/)).toBeVisible();
  });
});
