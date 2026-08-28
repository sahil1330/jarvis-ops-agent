// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createSession, resolveToolResponse, runTurn } from './lib/api';

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

class MockSpeechRecognition {
  static current: MockSpeechRecognition | null = null;
  static onStart: (() => void) | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => MockSpeechRecognition.onStart?.());

  constructor() {
    MockSpeechRecognition.current = this;
  }

  stop(): void {
    this.onend?.();
  }

  emit(transcript: string): void {
    this.onresult?.({ results: [{ 0: { transcript } }] });
  }
}

describe('App TrueForge user-input checkpoint', () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    delete window.SpeechRecognition;
  });

  beforeEach(() => {
    vi.mocked(createSession).mockReset().mockResolvedValue('session-input');
    vi.mocked(runTurn).mockReset();
    vi.mocked(resolveToolResponse).mockReset();
    MockSpeechRecognition.current = null;
    MockSpeechRecognition.onStart = null;
    window.SpeechRecognition = MockSpeechRecognition as never;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the hidden TrueForge question and resumes with user.tool_response content', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({ type: 'status', status: 'running' });
      onEvent({
        type: 'input_required',
        requests: [{
          threadId: 'main',
          toolCallId: 'question-1',
          toolName: 'ask_user_question',
          question: 'What should I use to identify the demo?',
          options: ['Use the client name', 'Proceed with a generic checklist'],
        }],
      });
    });
    vi.mocked(resolveToolResponse).mockImplementation(async (_sessionId, _responses, onEvent, _signal, onAccepted) => {
      onAccepted?.();
      onEvent({ type: 'delta', content: 'I will continue with a generic checklist.' });
      onEvent({ type: 'status', status: 'done' });
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Prepare me for the client demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    expect(await screen.findByRole('heading', { name: 'Jarvis needs your input' })).toHaveFocus();
    expect(screen.getByText('YOUR DECISION')).toBeVisible();
    expect(screen.getAllByText('Waiting for your input').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Jarvis needs one detail' })).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: 'Proceed with a generic checklist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(vi.mocked(resolveToolResponse)).toHaveBeenCalledWith(
      'session-input',
      [{ threadId: 'main', toolCallId: 'question-1', content: 'Proceed with a generic checklist' }],
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    ));
    expect(await screen.findByRole('heading', { name: 'Task complete' })).toBeVisible();
    expect(await screen.findByText(/I will continue with a generic checklist/i, {}, { timeout: 8_000 })).toBeVisible();
  });

  it('keeps a second TrueForge question visible after the first answer resumes', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({
        type: 'input_required',
        requests: [{
          threadId: 'main',
          toolCallId: 'subject-question',
          toolName: 'ask_user_question',
          question: 'What subject should I use?',
          options: ['Hello', 'Quick note'],
        }],
      });
    });
    vi.mocked(resolveToolResponse).mockImplementation(async (_sessionId, responses, onEvent, _signal, onAccepted) => {
      onAccepted?.();
      if (responses[0]?.toolCallId === 'subject-question') {
        onEvent({ type: 'status', status: 'running' });
        onEvent({
          type: 'input_required',
          requests: [{
            threadId: 'main',
            toolCallId: 'send-confirmation',
            toolName: 'ask_user_question',
            question: 'Approve sending this email now?',
            options: ['Yes, send it now (Recommended)', 'No, don’t send it'],
          }],
        });
      }
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Send an email to Sahil' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    fireEvent.click(await screen.findByRole('radio', { name: 'Hello' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(vi.mocked(resolveToolResponse)).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Approve sending this email now?')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Yes, send it now (Recommended)' })).toBeVisible();
    expect(screen.getAllByText('Waiting for your input').length).toBeGreaterThan(0);
  });

  it('lets the user answer the checkpoint conversationally by voice', async () => {
    vi.mocked(runTurn).mockImplementation(async (_sessionId, _command, onEvent) => {
      onEvent({
        type: 'input_required',
        requests: [{
          threadId: 'main',
          toolCallId: 'question-voice',
          toolName: 'ask_user_question',
          question: 'How should I identify the demo?',
          options: ['Use the client name', 'Proceed with a generic checklist'],
        }],
      });
    });
    vi.mocked(resolveToolResponse).mockImplementation(async (_sessionId, _responses, _onEvent, _signal, onAccepted) => {
      onAccepted?.();
    });

    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Command for Jarvis' }), {
      target: { value: 'Prepare me for the demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));

    let clickIsActive = false;
    let voiceStartedDuringClick = false;
    const enterClick = () => { clickIsActive = true; };
    const leaveClick = () => { clickIsActive = false; };
    document.addEventListener('click', enterClick, true);
    document.addEventListener('click', leaveClick);
    MockSpeechRecognition.onStart = () => {
      voiceStartedDuringClick = clickIsActive;
    };

    fireEvent.click(await screen.findByRole('button', { name: 'Answer Jarvis by voice' }));
    document.removeEventListener('click', enterClick, true);
    document.removeEventListener('click', leaveClick);
    await waitFor(() => expect(MockSpeechRecognition.current?.start).toHaveBeenCalledOnce());
    expect(voiceStartedDuringClick).toBe(true);
    act(() => MockSpeechRecognition.current?.emit('option two'));

    await waitFor(() => expect(vi.mocked(resolveToolResponse)).toHaveBeenCalledWith(
      'session-input',
      [{ threadId: 'main', toolCallId: 'question-voice', content: 'Proceed with a generic checklist' }],
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    ));
  });
});
