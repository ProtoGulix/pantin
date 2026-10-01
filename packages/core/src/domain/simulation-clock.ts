import { STEP_SECONDS } from "./fixed-step.ts";

// The clock of one open Pantin (ADR 0032): whether it runs, and the sliding
// window behind its achieved ratio. Pure: the monotonic time comes from the
// scheduler's tick, never from a clock read here.

const RATIO_WINDOW_SECONDS = 1;

// What one scheduler tick did for one Pantin. `due` counts the steps the
// shared scheduler owed it, the ones dropped by the catch-up cap included.
export type TickSample = {
  time: number;
  due: number;
  executed: number;
};

export type RatioWindow = {
  // Start of the first tick since the Pantin started running, null while paused.
  startedAt: number | null;
  samples: readonly TickSample[];
};

export type ClockRuntime = {
  running: boolean;
  window: RatioWindow;
  // Steps dropped by the scheduler while running, since the Pantin was loaded.
  droppedSteps: number;
};

export const EMPTY_RATIO_WINDOW: RatioWindow = { startedAt: null, samples: [] };

export function newClockRuntime(): ClockRuntime {
  return { running: true, window: EMPTY_RATIO_WINDOW, droppedSteps: 0 };
}

export function recordTick(window: RatioWindow, sample: TickSample): RatioWindow {
  if (window.startedAt === null) {
    // The shared scheduler gives a paused Pantin nothing, so this first tick
    // spans one tick interval, never the paused time, and a stall in it is a
    // real one. The window starts where the tick's due steps say it began.
    return { startedAt: sample.time - sample.due * STEP_SECONDS, samples: [sample] };
  }
  const oldest = sample.time - RATIO_WINDOW_SECONDS;
  return {
    startedAt: window.startedAt,
    samples: [...window.samples.filter((kept) => kept.time > oldest), sample],
  };
}

// Null until the Pantin has run for a whole window, and when nothing was due.
export function achievedRatio(window: RatioWindow): number | null {
  const latest = window.samples.at(-1);
  if (window.startedAt === null || latest === undefined) {
    return null;
  }
  if (latest.time - window.startedAt < RATIO_WINDOW_SECONDS) {
    return null;
  }
  const due = window.samples.reduce((total, sample) => total + sample.due, 0);
  const executed = window.samples.reduce((total, sample) => total + sample.executed, 0);
  return due === 0 ? null : executed / due;
}
