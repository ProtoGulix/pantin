import type {
  AlignmentPick,
  AlignmentPickRole,
  Body,
  FaceFile,
  FaceGeometry,
  PantinDocument,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { type ConnectorFrame, dot } from "./alignment-kinds/geometry.ts";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import {
  add,
  apply,
  normalize,
  type RigidTransform,
  rotate,
  scale,
  subtract,
  type Vector3,
} from "./rigid-transform.ts";

// The picks of an alignment (ADR 0035 points 3, 4 and 10): which side each
// is on, and the connector frame it gives, in the Pantin frame as displayed.

export type RoledPick = { pick: AlignmentPick; role: AlignmentPickRole; number: number };

// Pairs each pick with its role; the request schema already checked the count.
export function roledPicks(
  picks: readonly AlignmentPick[],
  roles: readonly AlignmentPickRole[],
): RoledPick[] {
  return picks.map((pick, index) => {
    const role = roles[index];
    if (role === undefined) {
      throw new ApiError("invalid_request", `Pick ${index + 1} is one pick too many.`);
    }
    return { pick, role, number: index + 1 };
  });
}

function bodyOfPick(document: PantinDocument, { pick, number }: RoledPick): Body {
  const body = document.bodies.find((candidate) => candidate.id === pick.body);
  if (body === undefined) {
    throw new ApiError("not_found", `Pick ${number}: this Pantin has no body "${pick.body}".`);
  }
  return body;
}

function isAnchoredBelow(document: PantinDocument, assembly: string, key: string): boolean {
  const anchors = deriveAssemblyAnchors(document);
  for (
    let anchor = anchors.get(assembly);
    anchor !== undefined;
    anchor = anchors.get(anchor.assembly)
  ) {
    if (anchor.assembly === key) {
      return true;
    }
  }
  return false;
}

/**
 * Checks the side of every pick against assembly `key`, the one that moves,
 * and returns the key body: the body of the first moving pick.
 */
export function checkPickSides(
  document: PantinDocument,
  key: string,
  picks: readonly RoledPick[],
): Body {
  let keyBody: Body | undefined;
  for (const roled of picks) {
    const body = bodyOfPick(document, roled);
    if (roled.role.side === "moving") {
      if (body.assembly !== key) {
        throw new ApiError(
          "invalid_request",
          `Pick ${roled.number} must be on a body of the assembly that moves, "${key}".`,
        );
      }
      keyBody ??= body;
    } else if (body.assembly === key || isAnchoredBelow(document, body.assembly, key)) {
      throw new ApiError(
        "conflict",
        `Pick ${roled.number} is on "${body.name}", which moves with the assembly "${key}": ` +
          "align to a body that stays in place.",
      );
    }
  }
  if (keyBody === undefined) {
    throw new Error("Every alignment kind has a moving pick.");
  }
  return keyBody;
}

function projectOnPlane(point: Vector3, planePoint: Vector3, normal: Vector3): Vector3 {
  return subtract(point, scale(normal, dot(subtract(point, planePoint), normal)));
}

function projectOnAxis(point: Vector3, axisPoint: Vector3, direction: Vector3): Vector3 {
  return add(axisPoint, scale(direction, dot(subtract(point, axisPoint), direction)));
}

function pickedFace(
  { pick, role, number }: RoledPick,
  faceFile: FaceFile | undefined,
): FaceGeometry {
  if (pick.kind !== "face") {
    throw new Error("Only a face pick has a face.");
  }
  const face = faceFile?.faces[pick.face];
  if (face === undefined) {
    throw new ApiError(
      "invalid_request",
      faceFile === undefined
        ? `Pick ${number}: body "${pick.body}" has no face file; pick the plane of a triangle.`
        : `Pick ${number}: body "${pick.body}" has no face ${pick.face}.`,
    );
  }
  if (face.kind !== role.face) {
    throw new ApiError(
      "invalid_request",
      `Pick ${number} must be a ${role.face}; face ${pick.face} of "${pick.body}" is of kind "${face.kind}".`,
    );
  }
  return face;
}

/**
 * The connector frame of a pick (ADR 0035 point 4). `pose` is the displayed
 * pose of the picked body, which places its face file geometry.
 */
export function connectorFrame(
  roled: RoledPick,
  pose: RigidTransform,
  faceFile: FaceFile | undefined,
): ConnectorFrame {
  const { pick, role, number } = roled;
  if (pick.kind === "plane") {
    if (!role.fallback) {
      throw new ApiError(
        "invalid_request",
        `Pick ${number} needs a cylinder face: an axis cannot be picked without a face file.`,
      );
    }
    return { origin: pick.point, direction: normalize(pick.normal) };
  }
  const face = pickedFace(roled, faceFile);
  if (face.kind === "plane") {
    const normal = normalize(rotate(pose.rotation, face.normal));
    return {
      origin: projectOnPlane(pick.point, apply(pose, face.point), normal),
      direction: normal,
    };
  }
  if (face.kind === "cylinder") {
    const direction = normalize(rotate(pose.rotation, face.direction));
    return {
      origin: projectOnAxis(pick.point, apply(pose, face.point), direction),
      direction,
    };
  }
  throw new Error("pickedFace only returns the face kind a role accepts.");
}
