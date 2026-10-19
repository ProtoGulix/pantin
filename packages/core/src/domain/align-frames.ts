import { endpointAssembly, type Joint, type PantinDocument } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { reframeAssembly } from "./reframe-assembly.ts";
import {
  axisAngleRotation,
  IDENTITY_TRANSFORM,
  inverse,
  normalize,
  type Quaternion,
  type RigidTransform,
  rotate,
  type Vector3,
} from "./rigid-transform.ts";

// Align the frames on a joint axis (ADR 0056 point 2). The axis is taken as a
// physical direction at the reference configuration; each frame to change
// turns by the smallest rotation that brings its Z onto it. World placements
// are unchanged by a reframe, so both rotations are worked out on the document
// as it stands.

export type AlignFramesOutcome = {
  document: PantinDocument;
  reframedAssemblies: string[];
  rewrittenJoints: Joint[];
};

const Z_AXIS: Vector3 = [0, 0, 1];
const ALREADY_ALIGNED = 1e-9;

function cross([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): Vector3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** The smallest rotation taking Z onto `target` (unit); undefined when it already is. */
export function rotationFromZ(target: Vector3): Quaternion | undefined {
  const turnAxis = cross(Z_AXIS, target);
  const sine = Math.hypot(...turnAxis);
  const cosine = target[2];
  if (sine < ALREADY_ALIGNED) {
    // Opposite: any axis perpendicular to Z does, X is the plain choice.
    return cosine > 0 ? undefined : axisAngleRotation([1, 0, 0], Math.PI);
  }
  return axisAngleRotation(turnAxis, Math.atan2(sine, cosine));
}

function nonFixedJoint(document: PantinDocument, jointId: string): Joint {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    throw new ApiError("not_found", `This Pantin has no joint "${jointId}".`);
  }
  if (joint.type === "fixed") {
    throw new ApiError(
      "conflict",
      `Joint "${jointId}" is fixed: a fixed joint has no axis to align with. Align on a slider or a pivot instead.`,
    );
  }
  return joint;
}

// The turn of `assemblyKey`, in its own frame, that puts its Z on the world
// direction `direction`.
function turnToward(
  worlds: ReadonlyMap<string, RigidTransform>,
  assemblyKey: string,
  direction: Vector3,
): Quaternion | undefined {
  const world = worlds.get(assemblyKey) ?? IDENTITY_TRANSFORM;
  return rotationFromZ(normalize(rotate(inverse(world).rotation, direction)));
}

export function alignFramesOnJoint(document: PantinDocument, jointId: string): AlignFramesOutcome {
  const joint = nonFixedJoint(document, jointId);
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const parentKey = endpointAssembly(joint.parent, assemblyOf);
  if (parentKey === undefined) {
    throw new ApiError("conflict", `The parent of joint "${jointId}" is in no assembly.`);
  }
  const worlds = computeWorldPlacements(document);
  const parentWorld = worlds.get(parentKey) ?? IDENTITY_TRANSFORM;
  const direction = rotate(parentWorld.rotation, normalize(joint.axis));
  const targets = [parentKey];
  if (joint.child.kind === "assembly" && joint.child.key !== parentKey) {
    targets.push(joint.child.key);
  }
  let result = document;
  const reframedAssemblies: string[] = [];
  for (const key of targets) {
    const turn = turnToward(worlds, key, direction);
    if (turn !== undefined) {
      result = reframeAssembly(result, key, turn);
      reframedAssemblies.push(key);
    }
  }
  const rewrittenJoints = result.joints.filter((after, index) => after !== document.joints[index]);
  return { document: result, reframedAssemblies, rewrittenJoints };
}
