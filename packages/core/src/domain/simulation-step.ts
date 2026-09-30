import type { PantinDocument } from "@pantin/protocol";
import { stepActuators } from "./actuator-step.ts";
import { stepDrives } from "./drive-step.ts";
import { clampJointPosition } from "./joint-types/registry.ts";
import type { SimulationState, SteppedState } from "./simulation-state.ts";
import { movedJointIds } from "./tags.ts";

// One simulation step of a Pantin (ADR 0028 point 11), as a pure function, at
// 1/120 s: the drives first (commands to port states and feedback), then the
// actuators (port states to joint motion), each list in id order. Sensors
// come after, in the service (ADR 0025). Joints that no actuator moves follow
// their setpoint tag (ADR 0012).

// The setpoint tags of joints that no actuator moves (ADR 0012 point 4, kept
// by ADR 0028 point 9): such a joint moves straight to its queued setpoint,
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

export function stepSimulation(
  document: PantinDocument,
  state: SimulationState,
  dt: number,
): SteppedState {
  const moved = movedJointIds(document);
  const undriven = new Map(
    [...state.queuedSetpoints].filter(
      ([jointId]) => !moved.has(jointId) && !state.jammedJointIds.has(jointId),
    ),
  );
  const next = {
    positions: applyQueuedSetpoints(document, state.jointPositions, undriven),
    velocities: new Map(state.jointVelocities),
  };
  const drives = stepDrives(document, state, dt);
  stepActuators(document, state, drives.drivePortStates, next, dt);
  return { jointPositions: next.positions, jointVelocities: next.velocities, ...drives };
}
