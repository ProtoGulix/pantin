import type { SimulationTimer } from "../service/simulation-loop.ts";

// A simulation timer that only moves when the test says so: advancing the
// clock fires every registered tick once, as a real timer would after that
// delay. Several ticks can be registered (one per pose stream keep-alive).
export type ManualTimer = {
  timer: SimulationTimer;
  advance(seconds: number): void;
  isRunning(): boolean;
  runningCount(): number;
};

export function createManualTimer(): ManualTimer {
  let time = 0;
  const ticks = new Set<() => void>();
  return {
    timer: {
      now: () => time,
      repeat: (_intervalSeconds, callback) => {
        const tick = () => callback();
        ticks.add(tick);
        return () => {
          ticks.delete(tick);
        };
      },
    },
    advance: (seconds) => {
      time += seconds;
      for (const tick of [...ticks]) {
        tick();
      }
    },
    isRunning: () => ticks.size > 0,
    runningCount: () => ticks.size,
  };
}
