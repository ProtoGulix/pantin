import type { PantinDocument } from "@pantin/protocol";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import type { Displacements } from "./kinematics.ts";
import { compose, isIdentityTransform, type RigidTransform } from "./rigid-transform.ts";

// The frame of every assembly as currently posed (ADR 0043 point 1): the
// static world frame W of ADR 0033 moved by the joints that anchor it, which
// is the frame the ADR 0042 trihedron draws.
//
// An assembly is anchored by exactly one joint between assemblies (document
// rule), whose child is that assembly as a group (ADR 0055). The displacement
// D of the group (kinematics.ts) already composes the whole anchor chain: the
// displacement of the parent, itself moved by the joints that anchor the
// parent's assembly, then this joint's motion. So the posed frame is
// D(group) ∘ W(assembly), the same product that places a body (D ∘ W ∘ B)
// without the body's own placement B. It does not depend on which body of the
// assembly is looked at. An assembly with no anchor keeps W, the very same
// transform (bit for bit at the reference configuration).

export function computePosedAssemblyFrames(
  document: Pick<PantinDocument, "assemblies" | "bodies" | "joints">,
  displacements: Displacements,
): Map<string, RigidTransform> {
  const frames = new Map<string, RigidTransform>();
  for (const [key, world] of computeWorldPlacements(document)) {
    const displacement = displacements.groups.get(key);
    frames.set(
      key,
      displacement === undefined || isIdentityTransform(displacement)
        ? world
        : compose(displacement, world),
    );
  }
  return frames;
}
