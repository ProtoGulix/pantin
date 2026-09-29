import type { Joint } from "@pantin/protocol";
import {
  axisAngleRotation,
  type RigidTransform,
  rotate,
  subtract,
  type Vector3,
} from "../rigid-transform.ts";

// What the core needs from a joint type (ADR 0013). Each type implements it
// in its own module; the registry maps the type name to it. Keep the method
// syntax below: it lets the registry look an entry up without a cast.
export type JointBehaviour<TypedJoint extends Joint> = {
  // Brings a requested coordinate inside what the joint allows.
  clamp(joint: TypedJoint, coordinate: number): number;
  // M(q): displacement of the child relative to the parent at coordinate q,
  // in the Pantin frame.
  motion(joint: TypedJoint, coordinate: number): RigidTransform;
};

export function clampToLimits(limits: readonly [number, number], coordinate: number): number {
  const [lower, upper] = limits;
  return Math.min(upper, Math.max(lower, coordinate));
}

// Rotation by `angle` about the axis through `origin`: x -> R (x - o) + o.
export function rotationAboutAxis(origin: Vector3, axis: Vector3, angle: number): RigidTransform {
  const rotation = axisAngleRotation(axis, angle);
  return { rotation, translation: subtract(origin, rotate(rotation, origin)) };
}
