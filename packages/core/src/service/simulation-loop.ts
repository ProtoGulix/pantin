import { dueSteps, STEP_SECONDS } from "../domain/fixed-step.ts";

// Turns elapsed time into fixed simulation steps (ADR 0012 points 5 and 6).
// The clock and the timer are injected: tests drive them by hand.

export type SimulationTimer = {
  // Monotonic time in seconds.
  now(): number;
  // Calls `tick` about every `intervalSeconds` until the returned stop is called.
  repeat(intervalSeconds: number, tick: () => void): () => void;
};

export function createRealSimulationTimer(): SimulationTimer {
  return {
    now: () => performance.now() / 1000,
    repeat: (intervalSeconds, tick) => {
      const handle = setInterval(tick, intervalSeconds * 1000);
      return () => clearInterval(handle);
    },
  };
}

export type SimulationLoop = { stop(): void };

// `reportError` receives what `runSteps` throws: a timer callback has no
// caller to propagate to, and one bad step must not kill the core.
export function startSimulationLoop(
  timer: SimulationTimer,
  runSteps: (steps: number) => void,
  reportError: (error: unknown) => void,
): SimulationLoop {
  let lastTime = timer.now();
  let carriedSeconds = 0;
  const stop = timer.repeat(STEP_SECONDS, () => {
    const now = timer.now();
    const due = dueSteps(now - lastTime, carriedSeconds);
    lastTime = now;
    carriedSeconds = due.carriedSeconds;
    try {
      runSteps(due.steps);
    } catch (error) {
      reportError(error);
    }
  });
  return { stop };
}
