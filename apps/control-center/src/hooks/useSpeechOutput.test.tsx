// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeech } from '../lib/api';
import { useSpeechOutput } from './useSpeechOutput';

vi.mock('../lib/api', () => ({
  createSpeech: vi.fn(),
  exchangeRealtimeVoiceSdp: vi.fn(),
}));

type SpeechOutput = ReturnType<typeof useSpeechOutput>;

class MockAudio {
  static instances: MockAudio[] = [];
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);

  constructor(readonly src: string) {
    MockAudio.instances.push(this);
  }
}

function Harness({ onChange }: { onChange: (speech: SpeechOutput) => void }) {
  const speech = useSpeechOutput(false, true);
  useEffect(() => onChange(speech), [onChange, speech]);
  return null;
}

describe('useSpeechOutput neural lookahead', () => {
  beforeEach(() => {
    MockAudio.instances = [];
    vi.mocked(createSpeech).mockReset().mockImplementation(async (text) => new Blob([text]));
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('requests the next speech clip before the current clip ends', async () => {
    let speech: SpeechOutput | null = null;
    render(<Harness onChange={(next) => { speech = next; }} />);
    await waitFor(() => expect(speech).not.toBeNull());

    act(() => {
      speech?.enqueue('First message.');
      speech?.enqueue('Second message.');
    });

    await waitFor(() => expect(createSpeech).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
    expect(vi.mocked(createSpeech).mock.calls.map(([text]) => text)).toEqual([
      'First message.',
      'Second message.',
    ]);

    act(() => MockAudio.instances[0]?.onended?.());
    await waitFor(() => expect(MockAudio.instances).toHaveLength(2));
    act(() => MockAudio.instances[1]?.onended?.());
  });

  it('aborts both current and prefetched speech requests when stopped', async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(createSpeech).mockImplementation((_text, signal) => new Promise((_resolve, reject) => {
      if (!signal) return;
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    let speech: SpeechOutput | null = null;
    render(<Harness onChange={(next) => { speech = next; }} />);
    await waitFor(() => expect(speech).not.toBeNull());

    act(() => {
      speech?.enqueue('First message.');
      speech?.enqueue('Second message.');
    });
    await waitFor(() => expect(signals).toHaveLength(2));

    act(() => speech?.stop());
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
