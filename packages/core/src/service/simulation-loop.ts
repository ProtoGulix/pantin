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

// What the scheduler decided at one tick: the steps to run, the ones it
// dropped beyond the catch-up cap, and the monotonic time of the tick (ADR 0032 point 5).
export type SimulationTick = {
  steps: number;
  droppedSteps: number;
  now: number;
};

export type SimulationLoop = { stop(): void };

// `reportError` receives what `runSteps` throws: a timer callback has no
// caller to propagate to, and one bad step must not kill the core.
export function startSimulationLoop(
  timer: SimulationTimer,
  runSteps: (tick: SimulationTick) => void,
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
      runSteps({ steps: due.steps, droppedSteps: due.droppedSteps, now });
    } catch (error) {
      reportError(error);
    }
  });
  return { stop };
}
