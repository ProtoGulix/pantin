import type { PlcModuleLossReason } from "@pantin/protocol";

// When a module whose session ended tries again (ADR 0065 points 5, 6 and 10): the bridge owns
// the retries, node-opcua's own are off. A lost or silent connection backs off from 1 s,
// doubling up to 10 s; a problem only the user can fix (nodes, certificate) is retried every
// 10 s, since the fix needs no restart.

export type RetryTimings = {
  firstBackoffMilliseconds: number;
  maxBackoffMilliseconds: number;
  fixedMilliseconds: number;
};

export const DEFAULT_RETRY_TIMINGS: RetryTimings = {
  firstBackoffMilliseconds: 1000,
  maxBackoffMilliseconds: 10_000,
  fixedMilliseconds: 10_000,
};

/** One module's retries. It remembers how long the connection has been failing. */
export type RetryPolicy = {
  /** The wait before the next attempt, after a session ended for `reason`. */
  delayAfter(reason: PlcModuleLossReason): number;
  /** A session was healthy: the next failure starts the backoff over. */
  sessionWasHealthy(): void;
};

export function createRetryPolicy(timings: RetryTimings = DEFAULT_RETRY_TIMINGS): RetryPolicy {
  let nextBackoff = timings.firstBackoffMilliseconds;
  return {
    delayAfter: (reason) => {
      if (reason === "node_mismatch" || reason === "certificate_rejected") {
        return timings.fixedMilliseconds;
      }
      const delay = nextBackoff;
      nextBackoff = Math.min(nextBackoff * 2, timings.maxBackoffMilliseconds);
      return delay;
    },
    sessionWasHealthy: () => {
      nextBackoff = timings.firstBackoffMilliseconds;
    },
  };
}
