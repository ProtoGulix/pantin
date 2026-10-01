import type { SimulationClockState } from "@pantin/protocol";
import { describeFailure, errorMessage } from "../messages.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The simulation clock of the open Pantin (ADR 0032): writes go through REST,
// the answer is the clock state and reaches the transport bar in place. A
// failure is a message, never a blocker, and none of these actions uses
// store.run: its busy indicator would redraw the viewer at every click.

// An answer is dropped when the Pantin was closed or replaced meanwhile.
async function applyClockAnswer(
  store: ViewerStore,
  pantinId: string,
  request: () => Promise<SimulationClockState>,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    const state = await request();
    if (store.state.openPantin?.id === pantinId) {
      store.receiveClock(state);
    }
  } catch (error) {
    onFailure(error);
  }
}

function showFailure(store: ViewerStore, error: unknown): void {
  store.update({ ...store.state, message: describeFailure(error) });
}

/** Resumes the Pantin that was just opened; a failure only tells the user. */
export async function resumeClock(store: ViewerStore, pantinId: string): Promise<void> {
  await applyClockAnswer(
    store,
    pantinId,
    () => store.ports.api.setClockRunning(pantinId, true),
    (error) =>
      store.update({
        ...store.state,
        message: errorMessage("message.clockResume", {}, describeFailure(error).detail),
      }),
  );
}

async function toggleClockRunning(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const clock = store.clockModel.state;
  if (open !== null && clock !== null) {
    await applyClockAnswer(
      store,
      open.id,
      () => store.ports.api.setClockRunning(open.id, !clock.running),
      (error) => showFailure(store, error),
    );
  }
}

// Two quick clicks send two step requests on purpose: each is valid while
// paused, the core applies them in order, and its clock event corrects the shown step.
async function stepClock(store: ViewerStore, steps: number): Promise<void> {
  const open = store.state.openPantin;
  // The core refuses a step while running; the bar already disables the buttons.
  if (open !== null && store.clockModel.state?.running === false) {
    await applyClockAnswer(
      store,
      open.id,
      () => store.ports.api.stepClock(open.id, steps),
      (error) => showFailure(store, error),
    );
  }
}

export function clockIntents(store: ViewerStore) {
  return {
    toggleClockRunning: () => void toggleClockRunning(store),
    stepClock: (steps: number) => void stepClock(store, steps),
  };
}
