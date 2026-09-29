import type { PantinId, Tag, TagListResponse } from "@pantin/protocol";
import { describeJointTags, jointOfCommandTag } from "../domain/joint-tags.ts";
import { applyQueuedSetpoints } from "../domain/simulation-step.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Tags and simulation steps of the open Pantins (ADR 0012).

export async function listTags(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<TagListResponse> {
  const openPantin = await loadPantin(context, pantinId);
  return {
    stepCount: openPantin.stepCount,
    tags: describeJointTags(openPantin.document, openPantin),
  };
}

// The value is queued: the joint moves at the next simulation step.
export async function writeTag(
  context: ServiceContext,
  pantinId: PantinId,
  tagName: string,
  value: number,
): Promise<Tag> {
  const openPantin = await loadPantin(context, pantinId);
  const joint = jointOfCommandTag(openPantin.document, tagName);
  openPantin.setpoints.set(joint.id, value);
  openPantin.queuedSetpoints.set(joint.id, value);
  return { name: tagName, type: "float", direction: "command", value };
}

function runSteps(openPantin: OpenPantin, steps: number): void {
  // The queue is consumed by the first step; later steps change nothing
  // until drives exist (phase 4), but they still count as simulated time.
  openPantin.jointPositions = applyQueuedSetpoints(
    openPantin.document,
    openPantin.jointPositions,
    openPantin.queuedSetpoints,
  );
  openPantin.queuedSetpoints.clear();
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
