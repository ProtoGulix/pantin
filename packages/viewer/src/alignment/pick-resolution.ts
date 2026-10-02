import {
  ALIGNMENT_KINDS,
  type AlignmentPick,
  type AlignmentPickRole,
  type FaceFile,
  type PantinDocument,
} from "@pantin/protocol";
import { anchorOfAssembly } from "../assembly-anchor.ts";
import type { Vector3Tuple } from "../frames.ts";
import {
  type AlignmentPickState,
  type AlignmentSession,
  nextPickIndex,
} from "./alignment-session.ts";
import { faceAtTriangle, primitiveOfPointers } from "./face-lookup.ts";

// What a click in the 3D view means while aligning (ADR 0035 point 3): the
// next pick of the kind, checked here against its role so that a wrong click
// says why at once. The core checks everything again.

/** A click on a body, as the viewport reports it, in the Pantin frame. */
export interface ViewportPick {
  bodyId: string;
  meshIndex: number;
  // glTF pointers of the picked Babylon mesh (face-lookup.ts).
  pointers: readonly string[];
  triangle: number;
  point: Vector3Tuple;
  // The picked triangle's normal, turned toward the camera: a visible face
  // shows its outside.
  normal: Vector3Tuple;
}

export type PickRefusal =
  | "allPicked"
  | "mustBeMoving"
  | "mustBeTarget"
  | "needsPlane"
  | "needsCylinder"
  | "noFaceFile"
  | "unmappedFace";

export type PickOutcome =
  | { ok: true; index: number; state: AlignmentPickState }
  | { ok: false; refusal: PickRefusal };

function copied([x, y, z]: Vector3Tuple): [number, number, number] {
  return [x, y, z];
}

function movesWith(document: PantinDocument, assembly: string, key: string): boolean {
  for (let current: string | null = assembly; current !== null; ) {
    if (current === key) {
      return true;
    }
    current = anchorOfAssembly(document, current);
  }
  return false;
}

function sideRefusal(
  document: PantinDocument,
  key: string,
  role: AlignmentPickRole,
  bodyId: string,
): PickRefusal | null {
  const assembly = document.bodies.find((body) => body.id === bodyId)?.assembly;
  if (role.side === "moving") {
    return assembly === key ? null : "mustBeMoving";
  }
  return assembly === undefined || movesWith(document, assembly, key) ? "mustBeTarget" : null;
}

// The face of the face file under the click, as a pick for `role`.
function facePickOutcome(
  click: ViewportPick,
  role: AlignmentPickRole,
  index: number,
  faceFile: FaceFile,
): PickOutcome | null {
  const primitive = primitiveOfPointers(click.pointers);
  const picked = primitive === null ? null : faceAtTriangle(faceFile, primitive, click.triangle);
  const geometry = picked === null ? undefined : faceFile.faces[picked.face];
  if (picked === null || geometry === undefined) {
    return null;
  }
  if (geometry.kind !== role.face) {
    return { ok: false, refusal: role.face === "plane" ? "needsPlane" : "needsCylinder" };
  }
  const pick: AlignmentPick = {
    kind: "face",
    body: click.bodyId,
    face: picked.face,
    point: copied(click.point),
  };
  const { firstTriangle, triangleCount } = picked;
  const highlight = { bodyId: click.bodyId, meshIndex: click.meshIndex, side: role.side };
  return {
    ok: true,
    index,
    state: {
      pick,
      faceKind: geometry.kind,
      highlight: { ...highlight, firstTriangle, triangleCount },
    },
  };
}

// The plane of the clicked triangle, for a role that accepts it.
function fallbackPickOutcome(
  click: ViewportPick,
  role: AlignmentPickRole,
  index: number,
): PickOutcome {
  const pick: AlignmentPick = {
    kind: "plane",
    body: click.bodyId,
    point: copied(click.point),
    normal: copied(click.normal),
  };
  const highlight = {
    bodyId: click.bodyId,
    meshIndex: click.meshIndex,
    side: role.side,
    firstTriangle: click.triangle,
    triangleCount: 1,
  };
  return { ok: true, index, state: { pick, faceKind: "fallback", highlight } };
}

/**
 * The pick a click makes, or why it is refused. `faceFile` is the clicked
 * body's face file, null when it has none.
 */
export function resolveAlignmentPick(
  document: PantinDocument,
  session: AlignmentSession,
  click: ViewportPick,
  faceFile: FaceFile | null,
): PickOutcome {
  const index = nextPickIndex(session);
  const role = index === null ? undefined : ALIGNMENT_KINDS[session.kind].picks[index];
  if (index === null || role === undefined) {
    return { ok: false, refusal: "allPicked" };
  }
  const refusal = sideRefusal(document, session.assemblyKey, role, click.bodyId);
  if (refusal !== null) {
    return { ok: false, refusal };
  }
  const facePick = faceFile === null ? null : facePickOutcome(click, role, index, faceFile);
  if (facePick !== null) {
    return facePick;
  }
  if (!role.fallback) {
    return { ok: false, refusal: faceFile === null ? "noFaceFile" : "unmappedFace" };
  }
  return fallbackPickOutcome(click, role, index);
}
