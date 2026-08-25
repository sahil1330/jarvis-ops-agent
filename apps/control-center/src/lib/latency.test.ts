import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finishApprovalResumeTiming,
  finishToolTiming,
  finishTurnTelemetry,
  formatLatency,
  getLatencySnapshot,
  markFirstAgentFeedback,
  markFirstVoiceStart,
  recordSttLatency,
  resetLatencyTelemetry,
  startApprovalResumeTiming,
  startToolTiming,
  startTurnTelemetry,
} from './latency';

afterEach(() => {
  vi.restoreAllMocks();
  resetLatencyTelemetry();
});

describe('latency telemetry', () => {
  it('records first feedback and first voice only once per turn', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(1_000); // turn start
    startTurnTelemetry();
    now.mockReturnValueOnce(1_120);
    markFirstAgentFeedback();
    markFirstAgentFeedback(); // duplicate does not sample the clock again
    now.mockReturnValueOnce(1_240);
    markFirstVoiceStart();
    markFirstVoiceStart();

    expect(getLatencySnapshot()).toMatchObject({
      firstAgentMs: 120,
      firstVoiceMs: 240,
    });
  });

  it('times tools without storing their arguments or results', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(2_000);
    startTurnTelemetry();
    now.mockReturnValueOnce(2_100); // first tool marker
    now.mockReturnValueOnce(2_100); // tool start
    startToolTiming('tool:calendar-1', 'Checking Google Calendar');
    now.mockReturnValueOnce(2_740);
    finishToolTiming('tool:calendar-1');

    expect(getLatencySnapshot()).toMatchObject({
      firstToolMs: 100,
      tools: [{ id: 'tool:calendar-1', label: 'Checking Google Calendar', durationMs: 640 }],
    });
  });

  it('applies a neural STT measurement to only the immediately following turn', () => {
    const now = vi.spyOn(performance, 'now');
    recordSttLatency(812.4);
    now.mockReturnValueOnce(3_000);
    startTurnTelemetry();
    expect(getLatencySnapshot().sttMs).toBe(812);

    now.mockReturnValueOnce(4_000);
    startTurnTelemetry();
    expect(getLatencySnapshot().sttMs).toBeUndefined();
  });

  it('records approval acceptance and total turn duration', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(5_000);
    startTurnTelemetry();
    now.mockReturnValueOnce(6_000);
    startApprovalResumeTiming();
    now.mockReturnValueOnce(6_180);
    finishApprovalResumeTiming();
    now.mockReturnValueOnce(7_500);
    finishTurnTelemetry();

    expect(getLatencySnapshot()).toMatchObject({
      approvalResumeMs: 180,
      totalTurnMs: 2_500,
    });
  });

  it('formats compact timings for the system rail', () => {
    expect(formatLatency(undefined)).toBe('—');
    expect(formatLatency(420)).toBe('420ms');
    expect(formatLatency(1_420)).toBe('1.4s');
    expect(formatLatency(12_400)).toBe('12s');
  });
});
