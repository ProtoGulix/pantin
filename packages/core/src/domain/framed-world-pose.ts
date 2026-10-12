import type { BodyPose } from "@pantin/protocol";
import {
  compose,
  IDENTITY_TRANSFORM,
  isIdentityTransform,
  type RigidTransform,
  unitTransform,
} from "./rigid-transform.ts";

// World pose of a phase 6 object (ADR 0043 point 1). With `body`, the placement
// is relative to that body's frame as currently posed, so the object follows the
// body; without it, relative to the assembly's world frame. The poses come from
// the existing kinematics: `computeWorldPlacements` for the assembly frames and
// `computePoses` (through `bodyPoseTransforms`) for the bodies. Both are worked
// out once per step by the caller.

export type Framed = {
  assembly: string;
  body?: string | undefined;
  placement: RigidTransform;
};

// The pose sent per body (D(b) ∘ W(assembly) ∘ B(b), kinematics.ts) is the
// body's frame in the world.
export function bodyPoseTransforms(poses: readonly BodyPose[]): Map<string, RigidTransform> {
  return new Map(
    poses.map((pose) => [pose.bodyId, { rotation: pose.rotation, translation: pose.translation }]),
  );
}

// An unknown assembly or body falls back to the world frame, as kinematics.ts
// does; the document rules (conveyorIssues) already refuse such references.
export function framedWorldPose(
  frame: Framed,
  assemblyWorlds: ReadonlyMap<string, RigidTransform>,
  bodyPoses: ReadonlyMap<string, RigidTransform>,
): RigidTransform {
  const base =
    (frame.body === undefined ? undefined : bodyPoses.get(frame.body)) ??
    assemblyWorlds.get(frame.assembly) ??
    IDENTITY_TRANSFORM;
  const placement = unitTransform(frame.placement);
  // Skipping a composition with an identity keeps poses bit for bit (kinematics.ts).
  if (isIdentityTransform(placement)) {
    return base;
  }
  return isIdentityTransform(base) ? placement : compose(base, placement);
}
