import { Ban, Check, Mail, ShieldAlert, CalendarClock } from 'lucide-react';
import type { ApprovalCall } from '../types';

function prettyArguments(raw: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, value]) => [
      key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
      Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : JSON.stringify(value),
    ]);
  } catch {
    return [['Details', raw]];
  }
}

type Props = {
  calls: ApprovalCall[];
  busy: boolean;
  onDecision: (status: 'allow' | 'deny') => void;
};

export function ApprovalCard({ calls, busy, onDecision }: Props) {
  const primary = calls[0];
  if (!primary) return null;
  const Icon = primary.toolName.includes('email') ? Mail : CalendarClock;

  return (
    <section className="approval-card" aria-labelledby="approval-title">
      <div className="approval-header">
        <div className="approval-symbol"><ShieldAlert size={20} /></div>
        <div>
          <span>HUMAN CHECKPOINT</span>
          <h2 id="approval-title">Permission required</h2>
        </div>
      </div>
      <p>Jarvis has finished its analysis. Nothing external happens until you approve the action below.</p>

      {calls.map((call) => (
        <article className="action-preview" key={call.toolCallId}>
          <div className="action-name"><Icon size={17} /><strong>{call.toolName.replaceAll('_', ' ')}</strong></div>
          <dl>
            {prettyArguments(call.arguments).map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </article>
      ))}

      <div className="approval-actions">
        <button type="button" className="deny-button" onClick={() => onDecision('deny')} disabled={busy}>
          <Ban size={16} /> Deny
        </button>
        <button type="button" className="approve-button" onClick={() => onDecision('allow')} disabled={busy}>
          <Check size={16} /> {busy ? 'Resuming…' : `Approve ${calls.length > 1 ? 'all' : 'action'}`}
        </button>
      </div>
    </section>
  );
}
