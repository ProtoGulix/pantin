import type { PantinDocument } from "@pantin/protocol";
import { anchorLinkOf } from "../assembly-anchor.ts";
import { multiplyQuaternions, type QuaternionTuple } from "../frames.ts";
import {
  composeTransforms,
  conjugate,
  IDENTITY_TRANSFORM,
  invertTransform,
  normalizedRotation,
  type RigidTransform,
} from "../rigid-transform.ts";
import type { GizmoSpace } from "./gizmo-space.ts";
import type { DragKind, SnapSteps } from "./placement-snapping.ts";

// Frame arithmetic of the placement gizmo (ADR 0034 point 4), in the core
// frame; the Babylon conversion happens in scene/placement-gizmo.ts through
// frames.ts. Notation: F is the DISPLAYED frame of an assembly's anchor, p the
// placement of the assembly in it, so the assembly's displayed frame is F . p.
//
// F comes from the pose stream. A pose carries D . W(X) . B(c) for a body c
// (ADR 0033 point 5): D the joint displacement, W(X) the world placement of
// c's assembly X, B(c) its optional placement in X. For the child body c of the
// joint that anchors X, W(X) = W(A) . p, and D, a world-space displacement
// about axes kept in A's frame, does not depend on p. Hence
//   F = D . W(A) = pose(c) . B(c)^-1 . p^-1
// which includes the motion of the anchoring joint, so the gizmo follows the
// assembly it moves. A world-anchored assembly has F = identity.

export interface GizmoTarget {
  assemblyKey: string;
  // The placement stored in the document (frame of the anchor).
  placement: RigidTransform;
  // The body whose pose gives F; null when anchored to the world.
  anchoring: { bodyId: string; bodyPlacement: RigidTransform | undefined } | null;
}

/** What the 3D view is asked to show: the assembly, what the gizmo does, and its steps. */
export interface PlacementGizmoSpec {
  target: GizmoTarget;
  kind: DragKind;
  space: GizmoSpace;
  steps: SnapSteps;
}

export type PoseLookup = (bodyId: string) => RigidTransform | undefined;

/** What the gizmo needs of an assembly; null when the document has no such assembly. */
export function gizmoTargetOf(
  document: Pick<PantinDocument, "assemblies" | "bodies" | "joints">,
  assemblyKey: string,
): GizmoTarget | null {
  const assembly = document.assemblies.find((candidate) => candidate.key === assemblyKey);
  if (assembly === undefined) {
    return null;
  }
  const link = anchorLinkOf(document, assemblyKey);
  const body = link === null ? undefined : document.bodies.find((b) => b.id === link.childBodyId);
  return {
    assemblyKey,
    placement: assembly.placement,
    anchoring: link === null ? null : { bodyId: link.childBodyId, bodyPlacement: body?.placement },
  };
}

// F is read from the interpolated pose of the anchoring body and the document's
// placement. For a frame or two after the Pantin is read again they can
// disagree (the stream lags the document); rare, and it corrects itself with
// the next snapshot.
/** The displayed frame of the anchor; null while the anchoring body has no pose yet. */
export function anchorFrameOf(target: GizmoTarget, poseOf: PoseLookup): RigidTransform | null {
  if (target.anchoring === null) {
    return IDENTITY_TRANSFORM;
  }
  const pose = poseOf(target.anchoring.bodyId);
  if (pose === undefined) {
    return null;
  }
  const { bodyPlacement } = target.anchoring;
  const withoutBody =
    bodyPlacement === undefined ? pose : composeTransforms(pose, invertTransform(bodyPlacement));
  return composeTransforms(withoutBody, invertTransform(target.placement));
}

/**
 * The rotation of the gizmo's axes seen from the anchor frame at the start of a
 * drag: the placement's own rotation in Local space (the assembly's axes), none
 * in Global space (the anchor's axes).
 */
export function gizmoAxesRotation(placement: RigidTransform, space: GizmoSpace): QuaternionTuple {
  return space === "local" ? placement.rotation : IDENTITY_TRANSFORM.rotation;
}

/**
 * Where the gizmo's node starts: at the assembly's displayed frame origin,
 * turned like the assembly (Local, the L1 trihedron) or like the ANCHOR
 * (Global, ADR 0034 point 3), so that the gizmo's own axes are those. A drag
 * moves or turns this node.
 */
export function gizmoNodeFrame(
  anchor: RigidTransform,
  placement: RigidTransform,
  space: GizmoSpace,
): RigidTransform {
  const frame = composeTransforms(anchor, placement);
  return {
    translation: frame.translation,
    rotation: space === "local" ? frame.rotation : anchor.rotation,
  };
}

/**
 * The placement a dragged node stands for, in the anchor frame, from the
 * frame F the drag started in and the placement p0 the assembly had then.
 *
 * The node started as (origin of F . p0, rotation of F . A) with A the axes
 * rotation of gizmoAxesRotation. It rotates about its own axes, so seen from
 * the anchor its rotation is A . delta, delta a rotation in the gizmo's axes;
 * the assembly turns with the node: R_p = (A . delta . A^-1) . R_p0. The
 * position is the node's, seen from the anchor: F^-1 (node).
 */
export function placementOfGizmoNode(
  anchor: RigidTransform,
  start: RigidTransform,
  node: RigidTransform,
  space: GizmoSpace,
): RigidTransform {
  const seen = composeTransforms(invertTransform(anchor), node);
  const axes = gizmoAxesRotation(start, space);
  const turned = multiplyQuaternions(seen.rotation, conjugate(axes));
  return {
    translation: seen.translation,
    rotation: normalizedRotation(multiplyQuaternions(turned, start.rotation)),
  };
}
