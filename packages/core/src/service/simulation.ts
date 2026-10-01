import type { ConsoleEvent, PantinId, Tag, TagListResponse } from "@pantin/protocol";
import { diagnosticEvents, stepErrorEvent } from "../domain/console-events.ts";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { stepSensors } from "../domain/sensor-step.ts";
import { recordTick } from "../domain/simulation-clock.ts";
import { stepSimulation } from "../domain/simulation-step.ts";
import { commandTagOf, describeTags } from "../domain/tags.ts";
import { ApiError } from "../errors.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";
import type { SimulationTick } from "./simulation-loop.ts";

// Tags and simulation steps of the open Pantins (ADR 0012, ADR 0022, ADR 0025, ADR 0028).

export async function listTags(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<TagListResponse> {
  const openPantin = await loadPantin(context, pantinId);
  return {
    stepCount: openPantin.stepCount,
    tags: describeTags(openPantin.document, openPantin),
    // Copies: the response must not alias state the next step replaces.
    drives: openPantin.document.drives.map((drive) => ({
      id: drive.id,
      ports: { ...openPantin.drivePortStates.get(drive.id) },
      diagnostics: [...(openPantin.driveDiagnostics.get(drive.id) ?? [])],
    })),
  };
}

// A joint setpoint is queued and consumed by the next step; a drive command
// is a level the drive reads at every step until it is written again.
export async function writeTag(
  context: ServiceContext,
  pantinId: PantinId,
  tagName: string,
  value: number,
): Promise<Tag> {
  const openPantin = await loadPantin(context, pantinId);
  const entry = commandTagOf(openPantin.document, tagName);
  if (entry.type === "bit" && value !== 0 && value !== 1) {
    throw new ApiError("invalid_request", `Tag "${tagName}" is a bit: write 0 or 1.`);
  }
  const { owner } = entry;
  if (owner.kind === "joint") {
    openPantin.setpoints.set(owner.joint.id, value);
    openPantin.queuedSetpoints.set(owner.joint.id, value);
  } else if (owner.kind === "drive") {
    // A sensor has feedback tags only, which commandTagOf refuses.
    const commands = openPantin.driveCommands.get(owner.drive.id) ?? {};
    openPantin.driveCommands.set(owner.drive.id, { ...commands, [entry.member]: value });
  }
  return { name: tagName, type: entry.type, direction: "command", value };
}

// A step is atomic: everything it computes is read before anything is
// stored, so a throw leaves the Pantin as it was (ADR 0031 point 3). Returns
// the console events of the step, for the caller to record once it applied.
function runStep(openPantin: OpenPantin): ConsoleEvent[] {
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
  openPantin.jointPositions = stepped.jointPositions;
  openPantin.jointVelocities = stepped.jointVelocities;
  openPantin.driveStates = stepped.driveStates;
  openPantin.drivePortStates = stepped.drivePortStates;
  openPantin.driveFeedback = stepped.driveFeedback;
  openPantin.driveDiagnostics = stepped.driveDiagnostics;
  openPantin.sensorOutputs = sensorOutputs;
  // Joint setpoints are consumed by the first step (ADR 0012 point 3).
  openPantin.queuedSetpoints.clear();
  openPantin.stepCount += 1;
  return events;
}

// A failing step is skipped and put in the console; the rest of this tick is
// skipped too, since the next step would fail on the same state. The Pantin
// is tried again at the next tick, and the others are not held back. Returns
// the steps that were applied.
export function runSteps(context: ServiceContext, openPantin: OpenPantin, steps: number): number {
  for (let step = 0; step < steps; step += 1) {
    let events: ConsoleEvent[];
    try {
      events = runStep(openPantin);
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
