import { describe, expect, it } from 'vitest';
import { approvalDecisionNarration } from './progress-narration';

const baseCall = {
  threadId: 'main',
  toolCallId: 'call-1',
  arguments: '{}',
};

describe('approvalDecisionNarration', () => {
  it('only says send now after the user has approved the email', () => {
    expect(approvalDecisionNarration([{ ...baseCall, toolName: 'send_email' }], 'allow'))
      .toBe("Got it. I'm sending the email now.");
  });

  it('combines multiple approved external actions naturally', () => {
    expect(approvalDecisionNarration([
      { ...baseCall, toolName: 'send_email' },
      { ...baseCall, toolCallId: 'call-2', toolName: 'move_calendar_event' },
    ], 'allow')).toBe("Got it. I'll send the email and update your calendar now.");
  });

  it('acknowledges denial without implying an action will run', () => {
    expect(approvalDecisionNarration([{ ...baseCall, toolName: 'send_email' }], 'deny'))
      .toBe("Understood. I won't make those changes.");
  });
});
