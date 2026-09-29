import type { SimulationTimer } from "../service/simulation-loop.ts";

// A simulation timer that only moves when the test says so: advancing the
// clock fires the tick once, as a real timer would after that delay.
export type ManualTimer = {
  timer: SimulationTimer;
  advance(seconds: number): void;
  isRunning(): boolean;
};

export function createManualTimer(): ManualTimer {
  let time = 0;
  let tick: (() => void) | undefined;
  return {
    timer: {
      now: () => time,
      repeat: (_intervalSeconds, callback) => {
        tick = callback;
        return () => {
          tick = undefined;
        };
      },
    },
    advance: (seconds) => {
      time += seconds;
      tick?.();
    },
    isRunning: () => tick !== undefined,
  };
}
