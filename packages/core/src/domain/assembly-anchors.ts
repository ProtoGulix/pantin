import type { Assembly, Body, Joint, PantinDocument } from "@pantin/protocol";
import { compose, IDENTITY_TRANSFORM, type RigidTransform } from "./rigid-transform.ts";

// Anchors of assemblies (ADR 0033 point 2), derived from the joints and never
// stored. The protocol refuses documents where this derivation is ambiguous
// (two anchors, loop), so it can trust the document it is given. The protocol
// holds schemas only, hence the derivation lives here, where the core reuses
// it for poses and for the edits that keep the world pose.

// An assembly is anchored by the joint between assemblies whose child body it
// holds; the anchor is the assembly of that joint's parent body.
type AssemblyAnchor = { assembly: string; joint: Joint };

type AnchorSource = { bodies: readonly Body[]; joints: readonly Joint[] };

// Key: the anchored assembly. A world-anchored assembly has no entry.
export function deriveAssemblyAnchors(document: AnchorSource): Map<string, AssemblyAnchor> {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const anchors = new Map<string, AssemblyAnchor>();
  for (const joint of document.joints) {
    const parentAssembly = assemblyOf.get(joint.parent);
    const childAssembly = assemblyOf.get(joint.child);
    if (
      parentAssembly !== undefined &&
      childAssembly !== undefined &&
      parentAssembly !== childAssembly
    ) {
      anchors.set(childAssembly, { assembly: parentAssembly, joint });
    }
  }
  return anchors;
}

// W(X) = W(anchor(X)) ∘ placement(X); world-anchored: W(X) = placement(X).
export function computeWorldPlacements(
  document: Pick<PantinDocument, "assemblies" | "bodies" | "joints">,
): Map<string, RigidTransform> {
  const anchors = deriveAssemblyAnchors(document);
  const placementOf = new Map(
    document.assemblies.map((assembly: Assembly) => [assembly.key, assembly.placement]),
  );
  const worlds = new Map<string, RigidTransform>();
  // Anchors form a forest (document schema), so the recursion ends.
  const worldOf = (key: string): RigidTransform => {
    const known = worlds.get(key);
    if (known !== undefined) {
      return known;
    }
    const own = placementOf.get(key) ?? IDENTITY_TRANSFORM;
    const anchor = anchors.get(key);
    const world = anchor === undefined ? own : compose(worldOf(anchor.assembly), own);
    worlds.set(key, world);
    return world;
  };
  for (const assembly of document.assemblies) {
    worldOf(assembly.key);
  }
  return worlds;
}

// The link and the assembly it hangs from: a placement is relative to that
// assembly's frame, so changing it invalidates the placement even when the
// link is the same.
export function anchorSignature(
  anchors: ReturnType<typeof deriveAssemblyAnchors>,
  key: string,
): string {
  const anchor = anchors.get(key);
  return anchor === undefined
    ? ""
    : `${anchor.joint.parent}|${anchor.joint.child}|${anchor.assembly}`;
}
