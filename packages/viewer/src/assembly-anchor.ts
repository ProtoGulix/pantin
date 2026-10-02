import type { PantinDocument } from "@pantin/protocol";

// Mirrors deriveAssemblyAnchors of the core (packages/core/src/domain/
// assembly-anchors.ts), which the viewer cannot import (CLAUDE.md section 3.4).
// ADR 0033 point 2: an assembly is anchored by the joint between assemblies
// whose child body it holds, and the anchor is the assembly of that joint's
// parent body. The anchor is derived, never stored; the core refuses a
// document where it would be ambiguous, so the last such joint wins here
// exactly as it does there.

/** The key of the assembly that `key` is anchored to; null: the world. */
export function anchorOfAssembly(
  document: Pick<PantinDocument, "bodies" | "joints">,
  key: string,
): string | null {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  let anchor: string | null = null;
  for (const joint of document.joints) {
    const parentAssembly = assemblyOf.get(joint.parent);
    if (
      assemblyOf.get(joint.child) === key &&
      parentAssembly !== undefined &&
      parentAssembly !== key
    ) {
      anchor = parentAssembly;
    }
  }
  return anchor;
}
