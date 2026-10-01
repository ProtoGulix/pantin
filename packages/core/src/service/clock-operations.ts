import type { PantinId, SimulationClockState } from "@pantin/protocol";
import { clockEvent } from "../domain/console-events.ts";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { achievedRatio, EMPTY_RATIO_WINDOW } from "../domain/simulation-clock.ts";
import { ApiError } from "../errors.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";
import { runSteps } from "./simulation.ts";

// Pause, resume and single steps of an open Pantin (ADR 0032).

export function toClockState(openPantin: OpenPantin): SimulationClockState {
  const { clock } = openPantin;
  return {
    running: clock.running,
    step: openPantin.stepCount,
    stepSeconds: STEP_SECONDS,
    achievedRatio: achievedRatio(clock.window),
    droppedSteps: clock.droppedSteps,
  };
}

async function getClock(context: ServiceContext, pantinId: PantinId) {
  return toClockState(await loadPantin(context, pantinId));
}

// Idempotent: only a real change is written to the console. Paused time stays
// out of the ratio window, so both directions start it afresh.
async function setClockRunning(
  context: ServiceContext,
  pantinId: PantinId,
  running: boolean,
): Promise<SimulationClockState> {
  const openPantin = await loadPantin(context, pantinId);
  if (openPantin.clock.running !== running) {
    openPantin.clock.running = running;
    openPantin.clock.window = EMPTY_RATIO_WINDOW;
    recordConsoleEvents(context, openPantin, [clockEvent(running)]);
  }
  return toClockState(openPantin);
}

// Synchronous once the Pantin is loaded: nothing else runs while the steps do.
async function stepClock(
  context: ServiceContext,
  pantinId: PantinId,
  steps: number,
): Promise<SimulationClockState> {
  const openPantin = await loadPantin(context, pantinId);
  if (openPantin.clock.running) {
    throw new ApiError(
      "conflict",
      `Pantin "${pantinId}" is running: pause it with PUT /api/pantins/${pantinId}/clock {"running": false} before stepping.`,
    );
  }
  runSteps(context, openPantin, steps);
  return toClockState(openPantin);
}

export function clockOperations(context: ServiceContext) {
  return {
    getClock: (pantinId: PantinId) => getClock(context, pantinId),
    setClockRunning: (pantinId: PantinId, running: boolean) =>
      setClockRunning(context, pantinId, running),
    stepClock: (pantinId: PantinId, steps: number) => stepClock(context, pantinId, steps),
  };
}
