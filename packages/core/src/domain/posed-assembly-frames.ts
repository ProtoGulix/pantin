import type { PantinDocument } from "@pantin/protocol";
import { computeWorldPlacements, deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { compose, isIdentityTransform, type RigidTransform } from "./rigid-transform.ts";

// The frame of every assembly as currently posed (ADR 0043 point 1): the
// static world frame W of ADR 0033 moved by the joints that anchor it, which
// is the frame the ADR 0042 trihedron draws.
//
// An assembly is anchored by exactly one joint between assemblies (document
// rule), whose child body is a body of that assembly. The displacement D of
// that body (kinematics.ts) already composes the whole anchor chain: the
// displacement of the parent body, itself moved by the joints that anchor the
// parent's assembly, then this joint's motion. So the posed frame is
// D(anchor child) ∘ W(assembly), the same product that places a body (D ∘ W ∘ B)
// without the body's own placement B. It does not depend on which body of the
// assembly is looked at, unlike pose(root) ∘ B⁻¹, which only holds for a body
// that is not moved by a joint inside the assembly. An assembly with no anchor
// keeps W, the very same transform (bit for bit at the reference configuration).

export function computePosedAssemblyFrames(
  document: Pick<PantinDocument, "assemblies" | "bodies" | "joints">,
  displacements: ReadonlyMap<string, RigidTransform>,
): Map<string, RigidTransform> {
  const anchors = deriveAssemblyAnchors(document);
  const frames = new Map<string, RigidTransform>();
  for (const [key, world] of computeWorldPlacements(document)) {
    const anchor = anchors.get(key);
    const displacement = anchor === undefined ? undefined : displacements.get(anchor.joint.child);
    frames.set(
      key,
      displacement === undefined || isIdentityTransform(displacement)
        ? world
        : compose(displacement, world),
    );
  }
  return frames;
}
