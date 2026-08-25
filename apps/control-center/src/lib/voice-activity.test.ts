import { describe, expect, it } from 'vitest';
import { createVoiceActivityState, updateVoiceActivity } from './voice-activity';

describe('voice activity detection', () => {
  it('waits for real speech before considering silence an endpoint', () => {
    let state = createVoiceActivityState();
    let result = updateVoiceActivity(state, 0.006, 0);
    state = result.state;
    result = updateVoiceActivity(state, 0.007, 1_500);
    expect(result.state.speechStarted).toBe(false);
    expect(result.shouldStop).toBe(false);
  });

  it('confirms steady speech across real animation-frame sampling', () => {
    let state = createVoiceActivityState();
    for (let now = 0; now <= 128; now += 16) {
      state = updateVoiceActivity(state, 0.05, now).state;
    }
    expect(state.speechStarted).toBe(true);
    expect(state.noiseFloor).toBeLessThan(0.02);
  });

  it('confirms speech and stops after sustained silence', () => {
    let state = createVoiceActivityState();
    state = updateVoiceActivity(state, 0.05, 0).state;
    state = updateVoiceActivity(state, 0.055, 120).state;
    expect(state.speechStarted).toBe(true);

    state = updateVoiceActivity(state, 0.04, 600).state;
    expect(updateVoiceActivity(state, 0.006, 1_300).shouldStop).toBe(false);
    expect(updateVoiceActivity(state, 0.006, 1_520).shouldStop).toBe(true);
  });

  it('resets the silence timer when the speaker continues', () => {
    let state = createVoiceActivityState();
    state = updateVoiceActivity(state, 0.05, 0).state;
    state = updateVoiceActivity(state, 0.05, 120).state;
    state = updateVoiceActivity(state, 0.04, 600).state;
    state = updateVoiceActivity(state, 0.006, 1_200).state;
    state = updateVoiceActivity(state, 0.04, 1_300).state;
    expect(updateVoiceActivity(state, 0.006, 2_000).shouldStop).toBe(false);
    expect(updateVoiceActivity(state, 0.006, 2_250).shouldStop).toBe(true);
  });
});
