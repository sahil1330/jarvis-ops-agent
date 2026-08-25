import { ArrowUp, Mic, MicOff, ShieldCheck } from 'lucide-react';
import { useSpeechInput } from '../hooks/useSpeechInput';

type Props = {
  command: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

const suggestions = [
  'I’m running one hour late. Check what this affects and handle it.',
  'Find urgent unread emails and prepare the replies I need to send.',
  'Check tomorrow for conflicts and propose the safest schedule.',
];

export function CommandComposer({ command, disabled, onChange, onSubmit }: Props) {
  const speech = useSpeechInput(onChange);

  return (
    <section className="command-panel" aria-labelledby="command-title">
      <div className="eyebrow"><ShieldCheck size={14} /> Approval-gated agent</div>
      <h1 id="command-title">What should I handle?</h1>
      <p className="lead">One command. Jarvis investigates, plans and pauses before anything leaves your account.</p>

      <div className={`composer ${speech.listening ? 'is-listening' : ''}`}>
        <textarea
          value={command}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit();
          }}
          placeholder="Tell Jarvis what changed…"
          rows={4}
          disabled={disabled}
          aria-label="Command for Jarvis"
        />
        <div className="composer-actions">
          <button
            type="button"
            className="icon-button"
            onClick={speech.toggle}
            disabled={!speech.supported || disabled}
            aria-label={speech.listening ? 'Stop listening' : 'Use voice input'}
            title={speech.supported ? 'Voice input' : 'Voice input is not supported in this browser'}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <span>{speech.listening ? 'Listening…' : '⌘ Enter to run'}</span>
          <button
            type="button"
            className="run-button"
            onClick={onSubmit}
            disabled={disabled || command.trim().length < 2}
          >
            Run command <ArrowUp size={16} />
          </button>
        </div>
      </div>

      <div className="suggestions" aria-label="Suggested commands">
        {suggestions.map((suggestion, index) => (
          <button type="button" key={suggestion} onClick={() => onChange(suggestion)} disabled={disabled}>
            <span>0{index + 1}</span>{suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
