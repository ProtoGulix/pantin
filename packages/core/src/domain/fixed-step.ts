// Fixed simulation step (ADR 0005) and how elapsed wall-clock time becomes a
// whole number of steps (ADR 0012 point 5).

export const STEP_SECONDS = 1 / 120;

// 100 ms of catch-up at most: after a longer stall the missed time is dropped
// rather than replayed, so the core answers again at once.
export const MAX_CATCH_UP_STEPS = 12;

export type DueSteps = {
  steps: number;
  // Elapsed time not yet worth a whole step, carried to the next tick.
  carriedSeconds: number;
};

export function dueSteps(elapsedSeconds: number, carriedSeconds: number): DueSteps {
  const available = carriedSeconds + Math.max(0, elapsedSeconds);
  const wholeSteps = Math.floor(available / STEP_SECONDS);
  if (wholeSteps > MAX_CATCH_UP_STEPS) {
    return { steps: MAX_CATCH_UP_STEPS, carriedSeconds: 0 };
  }
  return { steps: wholeSteps, carriedSeconds: available - wholeSteps * STEP_SECONDS };
}
