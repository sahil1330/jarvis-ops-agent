import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ArrowUp, Mic, MicOff, ShieldCheck } from 'lucide-react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { getHealth } from '../lib/api';
import type { CheckpointVoiceState } from '../types';

type Props = {
  command: string;
  disabled: boolean;
  checkpointMode?: 'approval' | 'input';
  speechCancelToken?: number;
  voiceContextKey?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVoiceTranscript?: (value: string, contextKey: string) => boolean;
  onVoiceStateChange?: (state: CheckpointVoiceState) => void;
};

export type CommandComposerHandle = {
  toggleVoice: () => void;
};

const suggestions = [
  'I have my client demo at 3 PM. Make sure I’m ready.',
  'Remember that I prefer meetings after 11 AM.',
  'Find urgent unread emails and prepare the replies I need to send.',
];

export const CommandComposer = forwardRef<CommandComposerHandle, Props>(function CommandComposer({
  command,
  disabled,
  checkpointMode,
  speechCancelToken = 0,
  voiceContextKey = '',
  onChange,
  onSubmit,
  onVoiceTranscript,
  onVoiceStateChange,
}: Props, ref) {
  const checkpointPending = checkpointMode !== undefined;
  const approvalMode = checkpointMode === 'approval';
  const inputMode = checkpointMode === 'input';
  const [neuralStt, setNeuralStt] = useState(false);
  const speech = useSpeechInput((text, contextKey) => {
    if (onVoiceTranscript?.(text, contextKey)) return;
    onChange(text);
  }, neuralStt, voiceContextKey);

  useEffect(() => {
    const controller = new AbortController();
    void getHealth(controller.signal)
      .then((health) => setNeuralStt(Boolean(health.audio?.stt)))
      .catch(() => setNeuralStt(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (speechCancelToken > 0) speech.cancel();
  }, [speech.cancel, speechCancelToken]);

  useEffect(() => {
    onVoiceStateChange?.({
      supported: speech.supported,
      listening: speech.listening,
      transcribing: speech.transcribing,
      autoStopsOnSilence: speech.autoStopsOnSilence,
      error: speech.error,
    });
  }, [onVoiceStateChange, speech.autoStopsOnSilence, speech.error, speech.listening, speech.supported, speech.transcribing]);

  useImperativeHandle(ref, () => ({ toggleVoice: speech.toggle }), [speech.toggle]);

  const speechStatus = speech.listening
    ? speech.autoStopsOnSilence
      ? 'Listening… I’ll stop when you pause'
      : 'Listening… tap again when finished'
    : speech.transcribing
      ? 'Transcribing with neural STT…'
      : speech.error
        ? speech.error
        : approvalMode
          ? 'Say “Approve it” or “Deny it” · buttons remain available'
          : inputMode
            ? 'Answer on screen or tap the microphone to reply'
          : speech.mode === 'neural'
            ? speech.autoStopsOnSilence
              ? 'Neural voice input ready · auto-stop on silence'
              : 'Neural voice input ready'
            : 'Ctrl/⌘ Enter to run';

  return (
    <section className="command-panel" aria-labelledby="command-title">
      <div className="eyebrow"><ShieldCheck size={14} /> Approval-gated agent</div>
      <h1 id="command-title">{approvalMode ? 'Your approval is required' : inputMode ? 'Jarvis needs one detail' : 'What should I handle?'}</h1>
      <p className="lead" id="command-description">
        {approvalMode
          ? 'Review the checkpoint, then use the approval buttons or an explicit voice decision. No new command starts while this checkpoint is pending.'
          : inputMode
            ? 'Jarvis is paused while it waits for your answer. Respond in the checkpoint or use voice, and it will continue the same task.'
          : 'Speak or type one objective. Jarvis investigates, verifies and pauses before external side effects.'}
      </p>

      <form
        className={`composer ${speech.listening ? 'is-listening' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!checkpointPending) onSubmit();
        }}
      >
        <label className="sr-only" htmlFor="jarvis-command">Command for Jarvis</label>
        <textarea
          id="jarvis-command"
          value={command}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!checkpointPending && (event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit();
          }}
          placeholder={approvalMode ? 'Approval pending — use voice or the checkpoint buttons' : inputMode ? 'Input pending — answer in the checkpoint below' : 'Tell Jarvis the outcome you need…'}
          rows={4}
          disabled={disabled || checkpointPending || speech.transcribing}
          aria-describedby="command-description command-shortcut"
          aria-keyshortcuts="Control+Enter Meta+Enter"
        />
        <div className="composer-actions">
          <button
            type="button"
            className="icon-button"
            onClick={speech.toggle}
            disabled={!speech.supported || disabled || speech.transcribing}
            aria-label={speech.listening ? 'Stop listening and transcribe' : approvalMode ? 'Use voice approval' : inputMode ? 'Answer Jarvis with voice' : 'Use voice input'}
            title={approvalMode ? 'Voice approval: say Approve it or Deny it' : inputMode ? 'Speak the answer Jarvis needs' : speech.mode === 'neural'
              ? speech.autoStopsOnSilence
                ? 'Neural voice input · stops automatically after you pause'
                : 'Neural voice input'
              : speech.supported
                ? 'Browser voice input fallback'
                : 'Voice input is not supported in this browser'}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <span id="command-shortcut" role="status" aria-live="polite">{speechStatus}</span>
          <button
            type="submit"
            className="run-button"
            disabled={disabled || checkpointPending || speech.transcribing || command.trim().length < 2}
          >
            Run command <ArrowUp size={16} />
          </button>
        </div>
      </form>

      {!checkpointPending && command.trim().length === 0 && (
        <div className="suggestions" aria-label="Suggested commands">
          {suggestions.map((suggestion, index) => (
            <button type="button" key={suggestion} onClick={() => onChange(suggestion)} disabled={disabled}>
              <span aria-hidden="true">0{index + 1}</span>{suggestion}
            </button>
          ))}
        </div>
      )}
    </section>
  );
});
