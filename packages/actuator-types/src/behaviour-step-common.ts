import type { PortState } from "@pantin/drive-types/ports";
import type { JointMotion } from "./behaviour-common.ts";

// The step contract of the actuator types (ADR 0028 point 3). Plain numbers
// only: a behaviour reads port states and joint motion, and answers the next
// position and velocity of each joint. It owns no state: an actuator has no
// inertia until loads are modelled.

export interface ActuatorStepInput<Fields> {
  fields: Fields;
  // The states of the input ports, by input port name. `null` when the actuator
  // has no feed: it then holds its joints where they are (ADR 0028 point 9).
  ports: Readonly<Record<string, PortState>> | null;
  joints: readonly JointMotion[];
  // Seconds of simulated time since the previous step.
  dt: number;
}

export interface ActuatorStepOutput {
  // One entry per input joint, in the same order.
  joints: { position: number; velocity: number }[];
}

// A method, not a function type: the registry (behaviours.ts) relies on
// method parameters being compared bivariantly.
export interface ActuatorBehaviour<Fields> {
  step(input: ActuatorStepInput<Fields>): ActuatorStepOutput;
}
