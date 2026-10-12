import type { PantinDocument, Placement } from "@pantin/protocol";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { bodyPoseTransforms, framedWorldPose } from "./framed-world-pose.ts";
import { computePoses } from "./kinematics.ts";
import type { RigidTransform } from "./rigid-transform.ts";

// World poses of the phase 6 objects at given joint positions (ADR 0043 point 1).

type FramedObject = {
  assembly: string;
  body?: string | undefined;
  placement: Placement;
};

export type FrameResolver = (object: FramedObject) => RigidTransform;

// The kinematics runs on the first object asked for, so a Pantin without
// phase 6 objects pays nothing per step.
export function frameResolver(
  document: PantinDocument,
  jointPositions: ReadonlyMap<string, number>,
): FrameResolver {
  let poses: { assemblies: Map<string, RigidTransform>; bodies: Map<string, RigidTransform> };
  return (object) => {
    poses ??= {
      assemblies: computeWorldPlacements(document),
      bodies: bodyPoseTransforms(computePoses(document, jointPositions)),
    };
    return framedWorldPose(object, poses.assemblies, poses.bodies);
  };
}

// What the world is built from (ADR 0043 point 11): the belts' and guides' ids,
// sizes and world poses at the reference configuration (no joint moved). Any
// edit of an object, its frame, or a placement or joint origin or axis that
// changes where it sits changes the key; joint motion during a run does not,
// the poses being read at every step.
export function physicsDefinitionKey(document: PantinDocument): string {
  if (document.belts.length === 0 && document.guides.length === 0) {
    return "[]";
  }
  const resolve = frameResolver(document, new Map());
  return JSON.stringify([
    document.belts.map((belt) => [belt.id, belt.length, belt.width, resolve(belt)]),
    document.guides.map((guide) => [guide.id, guide.size, resolve(guide)]),
  ]);
}
