export type VoiceActivityState = {
  noiseFloor: number;
  speechStarted: boolean;
  candidateStartedAt: number | null;
  lastVoiceAt: number | null;
};

export type VoiceActivityConfig = {
  minimumSpeechRms: number;
  minimumSilenceRms: number;
  speechToNoiseRatio: number;
  releaseToNoiseRatio: number;
  speechConfirmationMs: number;
  silenceToStopMs: number;
};

export const DEFAULT_VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  minimumSpeechRms: 0.022,
  minimumSilenceRms: 0.014,
  speechToNoiseRatio: 2.7,
  releaseToNoiseRatio: 1.65,
  speechConfirmationMs: 100,
  silenceToStopMs: 900,
};

export function createVoiceActivityState(): VoiceActivityState {
  return {
    noiseFloor: 0.008,
    speechStarted: false,
    candidateStartedAt: null,
    lastVoiceAt: null,
  };
}

export function updateVoiceActivity(
  state: VoiceActivityState,
  rms: number,
  now: number,
  config = DEFAULT_VOICE_ACTIVITY_CONFIG,
): { state: VoiceActivityState; shouldStop: boolean } {
  const safeRms = Number.isFinite(rms) ? Math.max(0, Math.min(rms, 1)) : 0;
  const noiseFloor = state.speechStarted
    ? state.noiseFloor
    : Math.min(0.03, state.noiseFloor * 0.94 + Math.min(safeRms, 0.04) * 0.06);
  const speechThreshold = Math.max(config.minimumSpeechRms, noiseFloor * config.speechToNoiseRatio);
  const releaseThreshold = Math.max(config.minimumSilenceRms, noiseFloor * config.releaseToNoiseRatio);

  if (!state.speechStarted) {
    if (safeRms >= speechThreshold) {
      const candidateStartedAt = state.candidateStartedAt ?? now;
      const confirmed = now - candidateStartedAt >= config.speechConfirmationMs;
      return {
        state: {
          noiseFloor,
          speechStarted: confirmed,
          candidateStartedAt: confirmed ? null : candidateStartedAt,
          lastVoiceAt: confirmed ? now : null,
        },
        shouldStop: false,
      };
    }

    return {
      state: {
        noiseFloor,
        speechStarted: false,
        candidateStartedAt: null,
        lastVoiceAt: null,
      },
      shouldStop: false,
    };
  }

  const lastVoiceAt = safeRms >= releaseThreshold ? now : state.lastVoiceAt;
  return {
    state: {
      noiseFloor,
      speechStarted: true,
      candidateStartedAt: null,
      lastVoiceAt,
    },
    shouldStop: lastVoiceAt !== null && now - lastVoiceAt >= config.silenceToStopMs,
  };
}

export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
