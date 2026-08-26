import { describe, expect, it } from 'vitest';
import { voiceApprovalDecision } from './voice-approval';

describe('voice approval decisions', () => {
  it.each(['approve', 'Approve it!', 'go ahead', 'yes approve', 'proceed'])('accepts explicit approval: %s', (value) => {
    expect(voiceApprovalDecision(value)).toBe('allow');
  });

  it.each(['deny', 'Deny it.', 'reject it', "don't do it", 'cancel it'])('accepts explicit denial: %s', (value) => {
    expect(voiceApprovalDecision(value)).toBe('deny');
  });

  it.each(['yes', 'okay', 'sounds good', 'continue', 'do what you think'])('does not infer approval from ambiguous speech: %s', (value) => {
    expect(voiceApprovalDecision(value)).toBeNull();
  });
});
