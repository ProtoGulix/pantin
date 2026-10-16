import type { ConsoleEvent } from "@pantin/protocol";
import { diagnosticEvents, stepErrorEvent } from "../domain/console-events.ts";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { stepSensors } from "../domain/sensor-step.ts";
import { recordTick } from "../domain/simulation-clock.ts";
import { stepSimulation } from "../domain/simulation-step.ts";
import { recordConsoleEvents } from "./console-record.ts";
import type { OpenPantin, ServiceContext } from "./open-pantins.ts";
import { stepPhysics, syncPhysics } from "./physics-runtime.ts";
import type { SimulationTick } from "./simulation-loop.ts";
import { syncTagStates } from "./tag-operations.ts";

// Simulation steps of the open Pantins (ADR 0012, ADR 0022, ADR 0025, ADR 0028);
// their tags are in tag-operations.ts.

// A step is atomic: everything it computes is read before anything is
// stored, so a throw leaves the Pantin as it was (ADR 0031 point 3). Returns
// the console events of the step, for the caller to record once it applied.
// Order (ADR 0043 point 10): drives, actuators, joint sensors, then the physics
// (frames, belts, spawns, world step, removals; ray casts and presence sensors). The
// one exception to atomicity is the world itself: it is stepped before the
// results are stored, and goes back to its empty snapshot if the step throws.
function runStep(context: ServiceContext, openPantin: OpenPantin): ConsoleEvent[] {
  const stepped = stepSimulation(openPantin.document, openPantin, STEP_SECONDS);
  const sensorOutputs = stepSensors(
    openPantin.document,
    stepped.jointPositions,
    openPantin.sensorOutputs,
  );
  const events = diagnosticEvents(
    openPantin.document,
    openPantin.driveDiagnostics,
    stepped.driveDiagnostics,
  );
  const physics = stepPhysics(
    context.physics,
    openPantin,
    stepped.jointPositions,
    stepped.jointVelocities,
  );
  openPantin.jointPositions = stepped.jointPositions;
  openPantin.jointVelocities = stepped.jointVelocities;
  openPantin.driveStates = stepped.driveStates;
  openPantin.drivePortStates = stepped.drivePortStates;
  openPantin.driveFeedback = stepped.driveFeedback;
  openPantin.driveDiagnostics = stepped.driveDiagnostics;
  openPantin.sensorOutputs = sensorOutputs;
  openPantin.physicsState = physics.state;
  // Joint setpoints are consumed by the first step (ADR 0012 point 3).
  openPantin.queuedSetpoints.clear();
  openPantin.stepCount += 1;
  return [...events, ...physics.events];
}

// A failing step is skipped and put in the console; the rest of this tick is
// skipped too, since the next step would fail on the same state. The Pantin
// is tried again at the next tick, and the others are not held back. Returns
// the steps that were applied.
export function runSteps(context: ServiceContext, openPantin: OpenPantin, steps: number): number {
  for (let step = 0; step < steps; step += 1) {
    let events: ConsoleEvent[];
    try {
      // Before the step, so that its rebuild is reported even if the step fails.
      syncPhysics(context, openPantin);
      events = runStep(context, openPantin);
    } catch (error) {
      if (recordConsoleEvents(context, openPantin, [stepErrorEvent(error)])) {
        context.reportStepError(error);
      }
      return step;
    }
    // Outside the try: a step_error is only ever a step that was not applied.
    recordConsoleEvents(context, openPantin, events);
  }
  return steps;
}

// Every running Pantin advances by the same number of steps: each is an
// isolated machine, but they share the core's clock. A paused one is skipped
// and gets no catch-up on resume (ADR 0032 point 2).
export function runSimulationSteps(context: ServiceContext, tick: SimulationTick): void {
  for (const openPantin of context.loadedPantins.values()) {
    // Paused Pantins too: bus clients read their forced tags (ADR 0045 point 4).
    syncTagStates(openPantin);
    if (!openPantin.clock.running) {
      continue;
    }
    const executed = runSteps(context, openPantin, tick.steps);
    const { clock } = openPantin;
    clock.droppedSteps += tick.droppedSteps;
    clock.window = recordTick(clock.window, {
      time: tick.now,
      due: tick.steps + tick.droppedSteps,
      executed,
    });
  }
}
