import type { UserInputRequest } from '../types';

export type VoiceInputAnswer = {
  content: string;
  matchedOption: boolean;
};

const ORDINALS = [
  ['1', 'one', 'first'],
  ['2', 'two', 'second'],
  ['3', 'three', 'third'],
  ['4', 'four', 'fourth'],
  ['5', 'five', 'fifth'],
] as const;

const FILLER_WORDS = new Set([
  'a', 'an', 'and', 'answer', 'choose', 'choice', 'for', 'i', 'id', 'ill', 'is', 'it',
  'my', 'of', 'option', 'please', 'select', 'the', 'to', 'use', 'want', 'would',
]);

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(normalized(value).split(' ').filter((token) => token.length > 1 && !FILLER_WORDS.has(token)));
}

function explicitOptionIndex(phrase: string, optionCount: number): number | null {
  for (let index = 0; index < Math.min(optionCount, ORDINALS.length); index += 1) {
    const terms = ORDINALS[index];
    if (terms.some((term) => (
      phrase === term ||
      new RegExp(`\\b(?:option|choice|number)\\s*(?:the\\s+)?${term}\\b`).test(phrase) ||
      new RegExp(`\\b${term}\\s+(?:option|choice)\\b`).test(phrase)
    ))) return index;
  }
  return null;
}

export function voiceInputAnswer(request: UserInputRequest, transcript: string): VoiceInputAnswer {
  const content = transcript.trim();
  if (!content || request.options.length === 0) return { content, matchedOption: false };

  const phrase = normalized(content);
  const explicitIndex = explicitOptionIndex(phrase, request.options.length);
  if (explicitIndex !== null) return { content: request.options[explicitIndex], matchedOption: true };

  const exactIndex = request.options.findIndex((option) => normalized(option) === phrase);
  if (exactIndex !== -1) return { content: request.options[exactIndex], matchedOption: true };

  const spokenTokens = meaningfulTokens(content);
  if (spokenTokens.size < 2) return { content, matchedOption: false };

  const candidates = request.options.flatMap((option, index) => {
    const optionTokens = meaningfulTokens(option);
    const matches = [...spokenTokens].filter((token) => optionTokens.has(token)).length;
    return matches >= 2 && matches / spokenTokens.size >= 0.6 ? [{ index, matches }] : [];
  }).sort((left, right) => right.matches - left.matches);

  if (candidates.length === 0 || (candidates[1] && candidates[1].matches === candidates[0].matches)) {
    return { content, matchedOption: false };
  }
  return { content: request.options[candidates[0].index], matchedOption: true };
}

export function inputAnswerNarration(answers: Array<{ content: string }>): string {
  if (answers.length !== 1) return `Got it. I have all ${answers.length} answers, so I'll continue.`;
  const answer = answers[0]?.content.trim() ?? '';
  if (!answer) return "I didn't catch an answer. Please try again.";
  const concise = answer.length > 96 ? `${answer.slice(0, 93).trimEnd()}…` : answer;
  return `Got it. I'll use “${concise}” and continue.`;
}
