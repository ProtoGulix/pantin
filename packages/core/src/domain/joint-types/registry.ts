import { JOINT_COORDINATE_UNITS, type Joint, type JointType } from "@pantin/protocol";
import type { RigidTransform } from "../rigid-transform.ts";
import type { JointBehaviour } from "./behaviour.ts";
import { CONTINUOUS_BEHAVIOUR } from "./continuous.ts";
import { FIXED_BEHAVIOUR } from "./fixed.ts";
import { HELICAL_BEHAVIOUR } from "./helical.ts";
import { PRISMATIC_BEHAVIOUR } from "./prismatic.ts";
import { REVOLUTE_BEHAVIOUR } from "./revolute.ts";

// Registry of joint behaviours (ADR 0013). The rest of the core asks these
// functions and never tests a joint type by name. A type declared in the
// protocol without an entry here does not compile.
// Steps: docs/guides/adding-a-joint-type.md.

const JOINT_BEHAVIOURS: {
  readonly [Type in JointType]: JointBehaviour<Extract<Joint, { type: Type }>>;
} = {
  fixed: FIXED_BEHAVIOUR,
  prismatic: PRISMATIC_BEHAVIOUR,
  revolute: REVOLUTE_BEHAVIOUR,
  continuous: CONTINUOUS_BEHAVIOUR,
  helical: HELICAL_BEHAVIOUR,
};

// The entry for joint.type handles that type: the record's type above
// guarantees it. TypeScript accepts the lookup without a cast because
// method parameters are compared bivariantly.
function behaviourOf(joint: Joint): JointBehaviour<Joint> {
  return JOINT_BEHAVIOURS[joint.type];
}

export function isMovableJoint(joint: Joint): boolean {
  return JOINT_COORDINATE_UNITS[joint.type] !== null;
}

// The core, not the viewer, keeps positions inside the limits (ADR 0011 point 5).
export function clampJointPosition(joint: Joint, position: number): number {
  return behaviourOf(joint).clamp(joint, position);
}

// M(q): the motion of a joint at position q, in the Pantin frame.
export function jointMotion(joint: Joint, position: number): RigidTransform {
  return behaviourOf(joint).motion(joint, position);
}
