import type { PantinDocument } from "@pantin/protocol";
import { clampJointPosition } from "./joint-types/registry.ts";

// One simulation step (ADR 0012 point 4). Until drives exist (phase 4), a
// joint moves straight to its queued setpoint, clamped to its limits.
// Setpoints of joints deleted since they were written are ignored.
export function applyQueuedSetpoints(
  document: PantinDocument,
  jointPositions: ReadonlyMap<string, number>,
  queuedSetpoints: ReadonlyMap<string, number>,
): Map<string, number> {
  const nextPositions = new Map(jointPositions);
  for (const joint of document.joints) {
    const setpoint = queuedSetpoints.get(joint.id);
    if (setpoint !== undefined) {
      nextPositions.set(joint.id, clampJointPosition(joint, setpoint));
    }
  }
  return nextPositions;
}
