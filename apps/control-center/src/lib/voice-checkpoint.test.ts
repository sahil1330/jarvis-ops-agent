import { describe, expect, it } from 'vitest';
import { inputAnswerNarration, voiceInputAnswer } from './voice-checkpoint';

const request = {
  threadId: 'main',
  toolCallId: 'question-1',
  toolName: 'ask_user_question',
  question: 'What should I use to identify the demo?',
  options: [
    'I’ll provide the client name or invite title so you can search again (Recommended)',
    'The details are outside Calendar/Gmail; I’ll provide the key requirements here',
    'Proceed with a generic demo readiness checklist only',
  ],
};

describe('voice checkpoint answers', () => {
  it.each([
    ['option two', request.options[1]],
    ['choose the third option', request.options[2]],
    ['number 1 please', request.options[0]],
  ])('maps an ordinal voice command (%s)', (transcript, expected) => {
    expect(voiceInputAnswer(request, transcript)).toEqual({ content: expected, matchedOption: true });
  });

  it('matches a natural paraphrase to one clear option', () => {
    expect(voiceInputAnswer(request, 'use the client name')).toEqual({
      content: request.options[0],
      matchedOption: true,
    });
  });

  it('keeps a specific free-form answer instead of forcing an option', () => {
    expect(voiceInputAnswer(request, 'The client is Acme')).toEqual({
      content: 'The client is Acme',
      matchedOption: false,
    });
  });

  it('creates a concise conversational acknowledgement', () => {
    expect(inputAnswerNarration([{ content: 'Use the client name' }]))
      .toBe('Got it. I\'ll use “Use the client name” and continue.');
  });
});
