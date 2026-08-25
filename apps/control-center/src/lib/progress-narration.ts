import type { ApprovalCall } from '../types';

export function approvalDecisionNarration(
  calls: ApprovalCall[],
  decision: 'allow' | 'deny',
): string | undefined {
  if (calls.length === 0) return undefined;
  if (decision === 'deny') return "Understood. I won't make those changes.";

  const sendingEmail = calls.some((call) => call.toolName === 'send_email');
  const movingCalendar = calls.some((call) => call.toolName === 'move_calendar_event');

  if (sendingEmail && movingCalendar) return "Got it. I'll send the email and update your calendar now.";
  if (sendingEmail) return "Got it. I'm sending the email now.";
  if (movingCalendar) return "Got it. I'm updating your calendar now.";
  return 'Got it. I’ll carry out the approved action now.';
}
