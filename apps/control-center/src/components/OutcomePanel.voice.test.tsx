// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutcomePanel } from './OutcomePanel';

const enqueue = vi.fn();
const speakNow = vi.fn();
const stop = vi.fn();
const checkpointVoice = {
  supported: true,
  listening: false,
  transcribing: false,
  autoStopsOnSilence: true,
  error: '',
  transcript: '',
  onToggle: vi.fn(),
};

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
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useRealTimers();
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
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
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
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
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
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
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
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
      />,
    );

    expect(enqueue).not.toHaveBeenCalledWith('Calendar checked.');
  });

  it('reveals response copy at a conversational pace instead of dumping it at once', () => {
    vi.useFakeTimers();
    const panelRef = { current: null };
    const { container } = render(
      <OutcomePanel
        panelRef={panelRef}
        phase="running"
        response="I checked your calendar and everything looks clear."
        narrations={[]}
        notices={[]}
        approvals={[]}
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
      />,
    );

    const visibleResponse = container.querySelector('.markdown-message');
    act(() => vi.advanceTimersByTime(0));
    expect(visibleResponse).toHaveTextContent('I');
    expect(visibleResponse).not.toHaveTextContent('everything looks clear');

    act(() => vi.advanceTimersByTime(2_000));
    expect(visibleResponse).toHaveTextContent('I checked your calendar and everything looks clear.');
  });

  it('speaks the approval checkpoint even when response text is already visible', () => {
    render(
      <OutcomePanel
        panelRef={{ current: null }}
        phase="paused"
        response="The email is ready."
        narrations={[]}
        notices={[]}
        approvals={[{ threadId: 'main', toolCallId: 'send-1', toolName: 'send_email', arguments: '{}' }]}
        inputRequests={[]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
      />,
    );

    expect(speakNow).toHaveBeenCalledWith('I need your approval before I send an email. Review the action, then say “approve it” or “deny it”, or use the buttons.');
  });

  it('speaks the TrueForge clarification question when input is required', () => {
    render(
      <OutcomePanel
        panelRef={{ current: null }}
        phase="paused"
        response=""
        narrations={[]}
        notices={[]}
        approvals={[]}
        inputRequests={[{
          threadId: 'main',
          toolCallId: 'question-1',
          toolName: 'ask_user_question',
          question: 'What should I use to identify the demo?',
          options: ['Use the client name'],
        }]}
        checkpointVoice={checkpointVoice}
        error=""
        metrics={{}}
        realtimeVoiceAvailable
        neuralTtsAvailable
        onDecision={vi.fn()}
        onInputSubmit={vi.fn()}
      />,
    );

    expect(speakNow).toHaveBeenCalledWith('I need your input before I can continue. What should I use to identify the demo? Choose on screen, or tap reply by voice and say an option or answer naturally.');
  });
});
