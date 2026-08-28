import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { CheckpointVoiceControl, UserInputRequest } from '../types';
import { CheckpointVoiceReply } from './CheckpointVoiceReply';

const CUSTOM_ANSWER = '__custom_answer__';

type AnswerState = {
  selected: string;
  custom: string;
};

type Props = {
  requests: UserInputRequest[];
  busy: boolean;
  voice?: CheckpointVoiceControl;
  onSubmit: (answers: Array<{ toolCallId: string; content: string }>) => void;
};

function answerFor(request: UserInputRequest, answers: Record<string, AnswerState>): string {
  const answer = answers[request.toolCallId];
  if (!answer) return '';
  return (answer.selected === CUSTOM_ANSWER ? answer.custom : answer.selected).trim();
}

export function UserInputCard({ requests, busy, voice, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestKey = useMemo(() => requests.map((request) => request.toolCallId).join('|'), [requests]);

  useEffect(() => {
    setAnswers({});
    headingRef.current?.focus();
  }, [requestKey]);

  if (requests.length === 0) return null;

  const complete = requests.every((request) => answerFor(request, answers).length > 0);

  return (
    <section
      className="user-input-card"
      aria-labelledby="user-input-title"
      aria-busy={busy}
    >
      <div className="user-input-header">
        <div>
          <span>YOUR DECISION</span>
          <h2 className="sr-only" id="user-input-title" ref={headingRef} tabIndex={-1}>Jarvis needs your input</h2>
        </div>
      </div>

      <div className="user-input-questions">
        {requests.map((request, requestIndex) => {
          const current = answers[request.toolCallId] ?? { selected: '', custom: '' };
          const customSelected = request.options.length === 0 || current.selected === CUSTOM_ANSWER;
          const inputName = `user-input-${request.toolCallId}`;
          return (
            <fieldset key={request.toolCallId}>
              <legend>
                {requests.length > 1 && <small>Question {requestIndex + 1} of {requests.length}</small>}
                {request.question}
              </legend>

              {request.options.length > 0 && (
                <div className="user-input-options">
                  {request.options.map((option) => (
                    <label key={option} className={current.selected === option ? 'is-selected' : ''}>
                      <input
                        type="radio"
                        name={inputName}
                        value={option}
                        checked={current.selected === option}
                        onChange={() => setAnswers((existing) => ({
                          ...existing,
                          [request.toolCallId]: { ...current, selected: option },
                        }))}
                        disabled={busy}
                      />
                      <strong>{option}</strong>
                    </label>
                  ))}
                  <label className={`user-input-other${current.selected === CUSTOM_ANSWER ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name={inputName}
                      value={CUSTOM_ANSWER}
                      checked={current.selected === CUSTOM_ANSWER}
                      onChange={() => setAnswers((existing) => ({
                        ...existing,
                        [request.toolCallId]: { ...current, selected: CUSTOM_ANSWER },
                      }))}
                      disabled={busy}
                    />
                    <strong>Something else</strong>
                  </label>
                </div>
              )}

              {customSelected && (
                <label className="user-input-custom">
                  <span>{request.options.length > 0 ? 'Your answer' : 'Type the detail Jarvis needs'}</span>
                  <textarea
                    rows={2}
                    value={current.custom}
                    onFocus={() => setAnswers((existing) => ({
                      ...existing,
                      [request.toolCallId]: { ...current, selected: CUSTOM_ANSWER },
                    }))}
                    onChange={(event) => setAnswers((existing) => ({
                      ...existing,
                      [request.toolCallId]: { selected: CUSTOM_ANSWER, custom: event.target.value },
                    }))}
                    placeholder="Type your answer…"
                    disabled={busy}
                  />
                </label>
              )}
            </fieldset>
          );
        })}
      </div>

      {voice && <CheckpointVoiceReply kind="input" voice={voice} disabled={busy} />}

      <div className="user-input-actions">
        <button
          type="button"
          onClick={() => onSubmit(requests.map((request) => ({
            toolCallId: request.toolCallId,
            content: answerFor(request, answers),
          })))}
          disabled={busy || !complete}
        >
          {busy ? 'Continuing…' : 'Continue'} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
