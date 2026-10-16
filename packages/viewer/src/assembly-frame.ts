import type { PantinDocument } from "@pantin/protocol";
import { jointPreviewOf } from "./joints/joint-preview.ts";
import { composeTransforms, invertTransform, type RigidTransform } from "./rigid-transform.ts";
import { selectedNodeIdOf } from "./selection.ts";
import { parseNodeId } from "./tree/node-ids.ts";
import type { ViewerState } from "./viewer-state.ts";

// The frame of an assembly, drawn as a trihedron (ADR 0042 point 1). Display
// arithmetic in the core frame; the Babylon conversion is in
// scene/assembly-trihedron.ts.
//
// A pose carries D . W . B (ADR 0033 point 5): D the joint displacement, W the
// world frame of the body's assembly, B the optional placement of the body in
// it. So the DISPLAYED frame of the assembly, which includes the joint's
// motion, is W' = pose . B^-1, read from any one body of the assembly.

/** The body whose pose gives the frame of an assembly, and its placement in it. */
export interface AssemblyFrameTarget {
  assemblyKey: string;
  bodyId: string;
  bodyPlacement: RigidTransform | undefined;
}

/** Same as displayedAssemblyFrame, with the body placement already inverted (once, not per frame). */
export function frameFromInverse(
  pose: RigidTransform,
  inversePlacement: RigidTransform | undefined,
): RigidTransform {
  return inversePlacement === undefined ? pose : composeTransforms(pose, inversePlacement);
}

/** The displayed frame of the assembly from its body's displayed pose. */
export function displayedAssemblyFrame(
  pose: RigidTransform,
  bodyPlacement: RigidTransform | undefined,
): RigidTransform {
  return frameFromInverse(pose, bodyPlacement && invertTransform(bodyPlacement));
}

/**
 * The root body of an assembly: the child of the joint that anchors it to
 * another assembly when there is one, since its pose . B^-1 is exactly the
 * posed frame the core places phase 6 objects in (ADR 0043 point 1); otherwise
 * the first body, in document order, not moved by an internal joint. Null when
 * the assembly has no body (no frame to read).
 */
export function frameTargetOfAssembly(
  document: Pick<PantinDocument, "bodies" | "joints">,
  assemblyKey: string,
): AssemblyFrameTarget | null {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  // Bodies moved by a joint from a body of their own assembly.
  const moved = new Set(
    document.joints
      .filter((joint) => assemblyOf.get(joint.parent) === assemblyKey)
      .map((joint) => joint.child),
  );
  const anchorChild = document.joints.find((joint) => {
    const parentAssembly = assemblyOf.get(joint.parent);
    return (
      assemblyOf.get(joint.child) === assemblyKey &&
      parentAssembly !== undefined &&
      parentAssembly !== assemblyKey
    );
  })?.child;
  const body =
    document.bodies.find((candidate) => candidate.id === anchorChild) ??
    document.bodies.find(
      (candidate) => candidate.assembly === assemblyKey && !moved.has(candidate.id),
    );
  return body === undefined
    ? null
    : { assemblyKey, bodyId: body.id, bodyPlacement: body.placement };
}

/**
 * Which frame the 3D view shows: the root body's assembly frame for a selected
 * assembly; for a selected joint or the joint form, the frame read through the
 * joint's PARENT body, whose pose is D(parent) . W . B like the joint arrow's
 * (the frame its origin and axis are read in, moved with the parent); none for
 * anything else.
 */
export function assemblyFrameTargetOf(state: ViewerState): AssemblyFrameTarget | null {
  const document = state.openPantin?.document;
  if (document === undefined) {
    return null;
  }
  const preview = jointPreviewOf(state);
  if (preview !== null) {
    const parent = document.bodies.find((body) => body.id === preview.parentBodyId);
    return parent === undefined
      ? null
      : { assemblyKey: parent.assembly, bodyId: parent.id, bodyPlacement: parent.placement };
  }
  const nodeId = selectedNodeIdOf(state.selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  return ref?.kind === "assembly" && ref.pantinId === state.openPantin?.id
    ? frameTargetOfAssembly(document, ref.key)
    : null;
}
