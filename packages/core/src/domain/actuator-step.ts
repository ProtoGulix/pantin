import { type JointMotion, stepActuator } from "@pantin/actuator-types/behaviours";
import type { PortState } from "@pantin/drive-types/ports";
import type { Actuator, Joint, PantinDocument } from "@pantin/protocol";
import { sortedById } from "./ids.ts";
import { clampJointPosition } from "./joint-types/registry.ts";
import { currentJointPosition } from "./kinematics.ts";
import type { PortStates, SimulationState } from "./simulation-state.ts";

// The actuator half of a simulation step (ADR 0028 points 8, 9 and 11): each
// actuator, in id order, reads the port states its feed maps to its input
// ports and answers the next position and velocity of its joints. A jammed
// joint keeps its position at velocity 0 whatever the actuator answers.

// Limits by clamping the infinities: no joint type is named here, and a joint
// without limits (continuous) gets infinite ones.
function motionOf(joint: Joint, state: SimulationState): JointMotion {
  return {
    position: currentJointPosition(joint, state.jointPositions),
    velocity: state.jointVelocities.get(joint.id) ?? 0,
    lower: clampJointPosition(joint, Number.NEGATIVE_INFINITY),
    upper: clampJointPosition(joint, Number.POSITIVE_INFINITY),
  };
}

// The states of the actuator's input ports, by input port. Null without a
// feed, or when the drive has no port state yet (unresponsive before its first
// step): the actuator then holds (ADR 0028 point 9).
function inputPortsOf(
  actuator: Actuator,
  drivePortStates: ReadonlyMap<string, PortStates>,
): Record<string, PortState> | null {
  const outputs =
    actuator.feed === undefined ? undefined : drivePortStates.get(actuator.feed.drive);
  if (actuator.feed === undefined || outputs === undefined) {
    return null;
  }
  const inputs: Record<string, PortState> = {};
  for (const [inputName, outputName] of Object.entries(actuator.feed.ports)) {
    const portState = outputs[outputName];
    if (portState === undefined) {
      return null;
    }
    inputs[inputName] = portState;
  }
  return inputs;
}

export function stepActuators(
  document: PantinDocument,
  state: SimulationState,
  drivePortStates: ReadonlyMap<string, PortStates>,
  next: { positions: Map<string, number>; velocities: Map<string, number> },
  dt: number,
): void {
  const jointsById = new Map(document.joints.map((joint) => [joint.id, joint]));
  for (const actuator of sortedById(document.actuators)) {
    const joints = actuator.joints.flatMap((id) => jointsById.get(id) ?? []);
    const output = stepActuator({
      fields: actuator,
      ports: inputPortsOf(actuator, drivePortStates),
      joints: joints.map((joint) => motionOf(joint, state)),
      dt,
    });
    for (const [index, joint] of joints.entries()) {
      const moved = output.joints[index];
      const jammed = state.jammedJointIds.has(joint.id);
      if (moved !== undefined && !jammed) {
        next.positions.set(joint.id, moved.position);
      }
      next.velocities.set(joint.id, moved === undefined || jammed ? 0 : moved.velocity);
    }
  }
}
