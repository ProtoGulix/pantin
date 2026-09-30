import type { PantinDocument } from "@pantin/protocol";
import { clampJointPosition } from "./joint-types/registry.ts";

// The setpoint tags of joints that no drive moves (ADR 0012 point 4, kept by
// ADR 0022 point 5): such a joint moves straight to its queued setpoint,
// clamped to its limits. Setpoints of deleted joints are ignored.
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
