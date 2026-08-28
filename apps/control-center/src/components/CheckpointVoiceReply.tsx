import { AudioLines, Mic, MicOff } from 'lucide-react';
import type { CheckpointVoiceControl } from '../types';

type Props = {
  kind: 'approval' | 'input';
  voice: CheckpointVoiceControl;
  disabled: boolean;
};

export function CheckpointVoiceReply({ kind, voice, disabled }: Props) {
  const instruction = kind === 'approval'
    ? 'Say “approve it” or “deny it”.'
    : 'Say “option two” or answer naturally.';
  const status = voice.listening
    ? voice.autoStopsOnSilence
      ? 'Listening—speak now. I’ll stop when you pause.'
      : 'Listening—speak now, then tap stop.'
    : voice.transcribing
      ? 'Understanding your reply…'
      : voice.error
        ? voice.error
        : voice.supported
          ? instruction
          : 'Voice is unavailable here. Use the choices below.';

  return (
    <div className={`checkpoint-voice${voice.listening ? ' is-listening' : ''}${voice.transcribing ? ' is-transcribing' : ''}`}>
      <div className="checkpoint-voice-signal" aria-hidden="true">
        <AudioLines size={19} />
      </div>
      <div className="checkpoint-voice-copy">
        <strong role="status" aria-live="polite" aria-atomic="true">{status}</strong>
        {voice.transcript && <p><b>YOU</b> “{voice.transcript}”</p>}
      </div>
      <button
        type="button"
        onClick={voice.onToggle}
        disabled={disabled || !voice.supported || voice.transcribing}
        aria-label={voice.listening ? 'Stop listening and use voice reply' : kind === 'approval' ? 'Give approval decision by voice' : 'Answer Jarvis by voice'}
      >
        {voice.listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        {voice.listening ? 'Stop listening' : 'Reply by voice'}
      </button>
    </div>
  );
}
