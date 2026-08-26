export type VoiceApprovalDecision = 'allow' | 'deny';

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,!?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALLOW_PHRASES = new Set([
  'approve',
  'approve it',
  'approved',
  'go ahead',
  'yes approve',
  'yes go ahead',
  'proceed',
]);

const DENY_PHRASES = new Set([
  'deny',
  'deny it',
  'reject',
  'reject it',
  'dont do it',
  "don't do it",
  'do not do it',
  'cancel it',
]);

export function voiceApprovalDecision(value: string): VoiceApprovalDecision | null {
  const phrase = normalized(value);
  if (ALLOW_PHRASES.has(phrase)) return 'allow';
  if (DENY_PHRASES.has(phrase)) return 'deny';
  return null;
}
