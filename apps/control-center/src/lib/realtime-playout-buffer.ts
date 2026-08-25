const DEFAULT_LOOKAHEAD_MS = 520;
const DEFAULT_BOUNDARY_SILENCE_MS = 60;
const DEFAULT_AUDIBLE_RMS = 0.0015;

type Options = {
  lookaheadMs?: number;
  boundarySilenceMs?: number;
  audibleRms?: number;
};

function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/**
 * Holds a short amount of Realtime PCM before it reaches the speakers.
 *
 * The model can start rendering the next response as soon as the previous
 * response.done event arrives. Dropping transport silence at that boundary
 * lets the queued tail and the next response play continuously and in order.
 */
export class RealtimePlayoutBuffer {
  private readonly lookaheadSamples: number;
  private readonly boundarySilenceSamples: number;
  private readonly audibleRms: number;
  private readonly chunks: Float32Array[] = [];
  private chunkOffset = 0;
  private queuedSamples = 0;
  private playbackStarted = false;
  private forceStart = false;
  private heardAudio = false;
  private boundaryPending = false;
  private skippedBoundarySamples = 0;
  private boundaryGapSeen = false;

  constructor(sampleRate: number, options: Options = {}) {
    this.lookaheadSamples = Math.max(
      1,
      Math.round(sampleRate * (options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS) / 1_000),
    );
    this.boundarySilenceSamples = Math.max(
      1,
      Math.round(sampleRate * (options.boundarySilenceMs ?? DEFAULT_BOUNDARY_SILENCE_MS) / 1_000),
    );
    this.audibleRms = options.audibleRms ?? DEFAULT_AUDIBLE_RMS;
  }

  push(samples: Float32Array): void {
    if (samples.length === 0) return;
    const audible = calculateRms(samples) >= this.audibleRms;

    if (!this.heardAudio) {
      if (!audible) return;
      this.heardAudio = true;
    }

    if (this.boundaryPending) {
      if (!audible) {
        this.skippedBoundarySamples += samples.length;
        this.boundaryGapSeen = this.skippedBoundarySamples >= this.boundarySilenceSamples;
        return;
      }

      // Any audible chunk ends the boundary candidate. If the preceding silence
      // was shorter than the transport-gap threshold it must not be carried into
      // a later, unrelated natural pause in the new response.
      this.boundaryPending = false;
      this.skippedBoundarySamples = 0;
      this.boundaryGapSeen = false;
    }

    const copy = samples.slice();
    this.chunks.push(copy);
    this.queuedSamples += copy.length;
  }

  markResponseBoundary(): void {
    this.trimTrailingSilence();
    this.boundaryPending = true;
    this.skippedBoundarySamples = 0;
    this.boundaryGapSeen = false;
    if (this.queuedSamples > 0 && !this.playbackStarted) this.forceStart = true;
  }

  private trimTrailingSilence(): void {
    while (this.chunks.length > 0) {
      const lastIndex = this.chunks.length - 1;
      const chunk = this.chunks[lastIndex];
      const unplayed = lastIndex === 0 ? chunk.subarray(this.chunkOffset) : chunk;
      if (calculateRms(unplayed) >= this.audibleRms) return;
      this.queuedSamples -= unplayed.length;
      this.chunks.pop();
      if (lastIndex === 0) this.chunkOffset = 0;
    }
  }

  pull(sampleCount: number): Float32Array {
    const output = new Float32Array(sampleCount);
    if (sampleCount === 0) return output;

    if (!this.playbackStarted) {
      if (!this.forceStart && this.queuedSamples < this.lookaheadSamples) return output;
      this.playbackStarted = true;
    }

    let outputOffset = 0;
    while (outputOffset < output.length && this.chunks.length > 0) {
      const chunk = this.chunks[0];
      const available = chunk.length - this.chunkOffset;
      const copied = Math.min(available, output.length - outputOffset);
      output.set(chunk.subarray(this.chunkOffset, this.chunkOffset + copied), outputOffset);
      outputOffset += copied;
      this.chunkOffset += copied;
      this.queuedSamples -= copied;

      if (this.chunkOffset === chunk.length) {
        this.chunks.shift();
        this.chunkOffset = 0;
      }
    }

    return output;
  }

  reset(): void {
    this.chunks.length = 0;
    this.chunkOffset = 0;
    this.queuedSamples = 0;
    this.playbackStarted = false;
    this.forceStart = false;
    this.heardAudio = false;
    this.boundaryPending = false;
    this.skippedBoundarySamples = 0;
    this.boundaryGapSeen = false;
  }
}
