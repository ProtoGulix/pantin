import type { PantinId, Tag, TagListResponse } from "@pantin/protocol";
import { stepSimulation } from "../domain/drive-step.ts";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { stepSensors } from "../domain/sensor-step.ts";
import { commandTagOf, describeTags } from "../domain/tags.ts";
import { ApiError } from "../errors.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Tags and simulation steps of the open Pantins (ADR 0012, ADR 0022, ADR 0025).

export async function listTags(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<TagListResponse> {
  const openPantin = await loadPantin(context, pantinId);
  return {
    stepCount: openPantin.stepCount,
    tags: describeTags(openPantin.document, openPantin),
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

function runSteps(openPantin: OpenPantin, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    const stepped = stepSimulation(openPantin.document, openPantin, STEP_SECONDS);
    openPantin.jointPositions = stepped.jointPositions;
    openPantin.jointVelocities = stepped.jointVelocities;
    openPantin.driveStates = stepped.driveStates;
    openPantin.driveFeedback = stepped.driveFeedback;
    openPantin.sensorOutputs = stepSensors(
      openPantin.document,
      openPantin.jointPositions,
      openPantin.sensorOutputs,
    );
    // Joint setpoints are consumed by the first step (ADR 0012 point 3).
    openPantin.queuedSetpoints.clear();
  }
  openPantin.stepCount += steps;
}

// Every loaded Pantin advances by the same number of steps: each is an
// isolated machine, but they share the core's clock.
export function runSimulationSteps(context: ServiceContext, steps: number): void {
  if (steps <= 0) {
    return;
  }
  for (const openPantin of context.loadedPantins.values()) {
    runSteps(openPantin, steps);
  }
}
