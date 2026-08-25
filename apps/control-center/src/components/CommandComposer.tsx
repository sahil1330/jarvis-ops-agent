import { useEffect, useState } from 'react';
import { ArrowUp, Mic, MicOff, ShieldCheck } from 'lucide-react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { getHealth } from '../lib/api';

type Props = {
  command: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

const suggestions = [
  'I’m running one hour late. Check what this affects and handle it.',
  'Remember that I prefer meetings after 11 AM.',
  'Find urgent unread emails and prepare the replies I need to send.',
];

export function CommandComposer({ command, disabled, onChange, onSubmit }: Props) {
  const [neuralStt, setNeuralStt] = useState(false);
  const speech = useSpeechInput(onChange, neuralStt);

  useEffect(() => {
    const controller = new AbortController();
    void getHealth(controller.signal)
      .then((health) => setNeuralStt(Boolean(health.audio?.stt)))
      .catch(() => setNeuralStt(false));
    return () => controller.abort();
  }, []);

  const speechStatus = speech.listening
    ? 'Listening… tap again when finished'
    : speech.transcribing
      ? 'Transcribing with neural STT…'
      : speech.error
        ? speech.error
        : speech.mode === 'neural'
          ? 'Neural voice input ready'
          : 'Ctrl/⌘ Enter to run';

  return (
    <section className="command-panel" aria-labelledby="command-title">
      <div className="eyebrow"><ShieldCheck size={14} /> Approval-gated agent</div>
      <h1 id="command-title">What should I handle?</h1>
      <p className="lead" id="command-description">Speak or type one command. Jarvis investigates, remembers explicit preferences and pauses before anything leaves your account.</p>

      <form
        className={`composer ${speech.listening ? 'is-listening' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="sr-only" htmlFor="jarvis-command">Command for Jarvis</label>
        <textarea
          id="jarvis-command"
          value={command}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit();
          }}
          placeholder="Tell Jarvis what changed…"
          rows={4}
          disabled={disabled || speech.transcribing}
          aria-describedby="command-description command-shortcut"
          aria-keyshortcuts="Control+Enter Meta+Enter"
        />
        <div className="composer-actions">
          <button
            type="button"
            className="icon-button"
            onClick={speech.toggle}
            disabled={!speech.supported || disabled || speech.transcribing}
            aria-label={speech.listening ? 'Stop listening and transcribe' : 'Use voice input'}
            title={speech.mode === 'neural' ? 'Neural voice input' : speech.supported ? 'Browser voice input fallback' : 'Voice input is not supported in this browser'}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <span id="command-shortcut" role="status" aria-live="polite">{speechStatus}</span>
          <button
            type="submit"
            className="run-button"
            disabled={disabled || speech.transcribing || command.trim().length < 2}
          >
            Run command <ArrowUp size={16} />
          </button>
        </div>
      </form>

      <div className="suggestions" aria-label="Suggested commands">
        {suggestions.map((suggestion, index) => (
          <button type="button" key={suggestion} onClick={() => onChange(suggestion)} disabled={disabled}>
            <span aria-hidden="true">0{index + 1}</span>{suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
