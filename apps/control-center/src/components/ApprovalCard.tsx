import { useEffect, useRef } from 'react';
import { Ban, Check, Mail, ShieldAlert, CalendarClock } from 'lucide-react';
import type { ApprovalCall, CheckpointVoiceControl } from '../types';
import { CheckpointVoiceReply } from './CheckpointVoiceReply';

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
  voice?: CheckpointVoiceControl;
  onDecision: (status: 'allow' | 'deny') => void;
};

export function ApprovalCard({ calls, busy, voice, onDecision }: Props) {
  const primary = calls[0];
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [primary?.toolCallId]);

  if (!primary) return null;

  return (
    <section
      className="approval-card"
      aria-labelledby="approval-title"
      aria-describedby="approval-description"
      aria-busy={busy}
    >
      <div className="approval-header">
        <div className="approval-symbol"><ShieldAlert size={20} /></div>
        <div>
          <span>HUMAN CHECKPOINT</span>
          <h2 id="approval-title" ref={headingRef} tabIndex={-1}>Permission required</h2>
        </div>
      </div>
      <p id="approval-description">Jarvis has finished its analysis. Nothing external happens until you approve the action below.</p>
      {voice && <CheckpointVoiceReply kind="approval" voice={voice} disabled={busy} />}

      {calls.map((call) => {
        const ActionIcon = call.toolName.includes('email') ? Mail : CalendarClock;
        const actionName = call.toolName.replaceAll('_', ' ');
        return (
          <article className="action-preview" key={call.toolCallId} aria-label={`Proposed action: ${actionName}`}>
            <div className="action-name"><ActionIcon size={17} aria-hidden="true" /><strong>{actionName}</strong></div>
            <dl>
              {prettyArguments(call.arguments).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </article>
        );
      })}

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
