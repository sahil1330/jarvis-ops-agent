import { useSyncExternalStore } from 'react';
import { getLatencySnapshot, subscribeLatency } from '../lib/latency';

export function useLatencyTelemetry() {
  return useSyncExternalStore(subscribeLatency, getLatencySnapshot, getLatencySnapshot);
}
