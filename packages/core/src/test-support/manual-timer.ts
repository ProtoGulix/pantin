import type { SimulationTimer } from "../service/simulation-loop.ts";

// A simulation timer that only moves when the test says so: advancing the
// clock fires once each registered tick whose interval has elapsed, as a real
// timer would after that delay (a long advance fires a tick once, not once
// per missed interval). Several ticks can be registered (pose stream timers).
export type ManualTimer = {
  timer: SimulationTimer;
  advance(seconds: number): void;
  isRunning(): boolean;
  runningCount(): number;
};

// Absorbs the float drift of summing steps of 1/120 s.
const INTERVAL_TOLERANCE_SECONDS = 1e-9;

export function createManualTimer(): ManualTimer {
  let time = 0;
  const ticks = new Set<{ intervalSeconds: number; dueAt: number; callback: () => void }>();
  return {
    timer: {
      now: () => time,
      repeat: (intervalSeconds, callback) => {
        const tick = { intervalSeconds, dueAt: time + intervalSeconds, callback };
        ticks.add(tick);
        return () => {
          ticks.delete(tick);
        };
      },
    },
    advance: (seconds) => {
      time += seconds;
      for (const tick of [...ticks]) {
        if (time >= tick.dueAt - INTERVAL_TOLERANCE_SECONDS) {
          tick.dueAt = time + tick.intervalSeconds;
          tick.callback();
        }
      }
    },
    isRunning: () => ticks.size > 0,
    runningCount: () => ticks.size,
  };
}
