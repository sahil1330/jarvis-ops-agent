// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutcomePanel } from './OutcomePanel';

const enqueue = vi.fn();
const speakNow = vi.fn();
const stop = vi.fn();

vi.mock('../hooks/useSpeechOutput', () => ({
  useSpeechOutput: () => ({
    enabled: true,
    speaking: false,
    mode: 'realtime',
    enqueue,
    speakNow,
    stop,
    toggle: vi.fn(),
  }),
}));

describe('OutcomePanel streaming voice', () => {
  beforeEach(() => {
    enqueue.mockReset();
    speakNow.mockReset();
    stop.mockReset();
  });

  it('queues a completed sentence while the agent is still running', () => {
    const panelRef = { current: null };
    render(
      <OutcomePanel
        panelRef={panelRef}
        phase="running"
        response="I checked your calendar. I am checking Gmail"
        narrations={[]}
        notices={[]}
        approvals={[]}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
      />,
    );

    expect(enqueue).toHaveBeenCalledWith('I checked your calendar.');
    expect(enqueue).not.toHaveBeenCalledWith('I checked your calendar. I am checking Gmail');
  });

  it('queues runtime progress narration while tools are running', () => {
    const panelRef = { current: null };
    render(
      <OutcomePanel
        panelRef={panelRef}
        phase="running"
        response=""
        narrations={[{ id: 'calendar-progress', content: "I'll check your calendar now." }]}
        notices={[]}
        approvals={[]}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
      />,
    );

    expect(enqueue).toHaveBeenCalledWith("I'll check your calendar now.");
  });

  it('does not replay the full accumulated response when the turn completes', () => {
    const panelRef = { current: null };
    const { rerender } = render(
      <OutcomePanel
        panelRef={panelRef}
        phase="running"
        response="Calendar checked."
        narrations={[]}
        notices={[]}
        approvals={[]}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
      />,
    );

    expect(enqueue).toHaveBeenCalledWith('Calendar checked.');
    enqueue.mockClear();

    rerender(
      <OutcomePanel
        panelRef={panelRef}
        phase="done"
        response="Calendar checked."
        narrations={[]}
        notices={[]}
        approvals={[]}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
      />,
    );

    expect(enqueue).not.toHaveBeenCalledWith('Calendar checked.');
  });
});
