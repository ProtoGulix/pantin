import type { FaceFile, Joint, JointAxisFromFaceResponse, PantinDocument } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { projectOnAxis, projectOnPlane } from "./alignment-picks.ts";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { computeDisplacements, computePoses } from "./kinematics.ts";
import {
  apply,
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  normalize,
  type RigidTransform,
  rotate,
  type Vector3,
} from "./rigid-transform.ts";

// The origin and axis of a joint taken from a picked face (ADR 0041).

const SNAP_TOLERANCE = 1e-9;

export type PickedFace = { bodyId: string; faceIndex: number; hitPoint: Vector3 };

// Components within 1e-9 of 0, 1 or -1 become exactly that (ADR 0041 point 4).
export function snapComponent(value: number): number {
  for (const target of [0, 1, -1]) {
    if (Math.abs(value - target) < SNAP_TOLERANCE) {
      return target;
    }
  }
  return value;
}

function snapVector([x, y, z]: Vector3): [number, number, number] {
  return [snapComponent(x), snapComponent(y), snapComponent(z)];
}

/**
 * Origin and axis of a picked face in the Pantin frame. `pose` is the
 * displayed pose of the picked body, which places its face file geometry.
 */
function faceAxisInPantin(
  faceFile: FaceFile | undefined,
  { bodyId, faceIndex, hitPoint }: PickedFace,
  pose: RigidTransform,
): JointAxisFromFaceResponse {
  if (faceFile === undefined) {
    throw new ApiError(
      "invalid_request",
      `Body "${bodyId}" has no face file, so no axis can be taken from it: ` +
        "reimport the STEP file to get one, or type the axis.",
    );
  }
  const face = faceFile.faces[faceIndex];
  if (face === undefined) {
    throw new ApiError("not_found", `Body "${bodyId}" has no face ${faceIndex}.`);
  }
  if (face.kind === "plane") {
    const normal = normalize(rotate(pose.rotation, face.normal));
    const origin = projectOnPlane(hitPoint, apply(pose, face.point), normal);
    return { origin: [...origin], axis: [...normal] };
  }
  if (face.kind === "cylinder") {
    const axis = normalize(rotate(pose.rotation, face.direction));
    const origin = projectOnAxis(hitPoint, apply(pose, face.point), axis);
    return { origin: [...origin], axis: [...axis] };
  }
  throw new ApiError(
    "invalid_request",
    `Face ${faceIndex} of "${bodyId}" is neither a plane nor a cylinder: pick a shaft, a bore or a flat face.`,
  );
}

/**
 * The transform from the frame of the joint (its parent body's assembly,
 * carried by the parent's displacement, as in kinematics.ts) to the Pantin
 * frame as displayed.
 */
function jointFrame(
  document: PantinDocument,
  joint: Joint,
  positions: ReadonlyMap<string, number>,
): RigidTransform {
  const parent = document.bodies.find((body) => body.id === joint.parent);
  const world =
    (parent && computeWorldPlacements(document).get(parent.assembly)) ?? IDENTITY_TRANSFORM;
  const displacement = computeDisplacements(document, positions).get(joint.parent);
  return compose(displacement ?? IDENTITY_TRANSFORM, world);
}

function axisInJointFrame(
  pantinFrame: JointAxisFromFaceResponse,
  frame: RigidTransform,
): JointAxisFromFaceResponse {
  const toLocal = inverse(frame);
  return {
    origin: snapVector(apply(toLocal, pantinFrame.origin)),
    axis: snapVector(normalize(rotate(toLocal.rotation, pantinFrame.axis))),
  };
}

/**
 * Origin and axis of `joint` read on the picked face, in the configuration
 * `positions` of `document`, in the frame of the joint's parent assembly.
 */
export function jointAxisOfFace(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
  joint: Joint,
  faceFile: FaceFile | undefined,
  pick: PickedFace,
): JointAxisFromFaceResponse {
  const pose = computePoses(document, positions).find(({ bodyId }) => bodyId === pick.bodyId);
  const inPantin = faceAxisInPantin(faceFile, pick, {
    rotation: pose?.rotation ?? IDENTITY_TRANSFORM.rotation,
    translation: pose?.translation ?? IDENTITY_TRANSFORM.translation,
  });
  return axisInJointFrame(inPantin, jointFrame(document, joint, positions));
}
