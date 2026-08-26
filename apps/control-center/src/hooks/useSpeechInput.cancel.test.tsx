// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechInput } from './useSpeechInput';

type SpeechInput = ReturnType<typeof useSpeechInput>;

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    MockMediaRecorder.instances.push(this);
  }

  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}

function Harness({ onChange }: { onChange: (speech: SpeechInput) => void }) {
  const speech = useSpeechInput(() => undefined, true, 'approval:test');
  useEffect(() => onChange(speech), [onChange, speech]);
  return null;
}

describe('useSpeechInput cancellation', () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('does not start recording when cancellation wins while microphone permission is pending', async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    let speech: SpeechInput | null = null;
    render(<Harness onChange={(next) => { speech = next; }} />);
    await waitFor(() => expect(speech).not.toBeNull());

    act(() => speech?.toggle());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    act(() => speech?.cancel());

    await act(async () => {
      resolveStream?.(stream);
      await Promise.resolve();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect((speech as SpeechInput | null)?.listening).toBe(false);
  });

  it('does not fall back to browser recognition after a cancelled permission rejection', async () => {
    let rejectPermission: ((reason?: unknown) => void) | undefined;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((_resolve, reject) => { rejectPermission = reject; }));
    const recognitionStart = vi.fn();
    class MockRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult = null;
      onend = null;
      onerror = null;
      start = recognitionStart;
      stop = vi.fn();
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.SpeechRecognition = MockRecognition as never;

    let speech: SpeechInput | null = null;
    render(<Harness onChange={(next) => { speech = next; }} />);
    await waitFor(() => expect(speech).not.toBeNull());

    act(() => speech?.toggle());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    act(() => speech?.cancel());
    await act(async () => {
      rejectPermission?.(new DOMException('Denied', 'NotAllowedError'));
      await Promise.resolve();
    });

    expect(recognitionStart).not.toHaveBeenCalled();
    delete window.SpeechRecognition;
  });
});
