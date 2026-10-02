import type { PantinDocument } from "@pantin/protocol";

// Mirrors deriveAssemblyAnchors of the core (packages/core/src/domain/
// assembly-anchors.ts), which the viewer cannot import (CLAUDE.md section 3.4).
// ADR 0033 point 2: an assembly is anchored by the joint between assemblies
// whose child body it holds, and the anchor is the assembly of that joint's
// parent body. The anchor is derived, never stored; the core refuses a
// document where it would be ambiguous, so the last such joint wins here
// exactly as it does there.

type AnchorDocument = Pick<PantinDocument, "bodies" | "joints">;

export interface AnchorLink {
  // Key of the anchor assembly.
  anchor: string;
  // The body of the assembly that the anchoring joint moves.
  childBodyId: string;
}

/** The link that anchors the assembly `key` to another assembly; null: the world. */
export function anchorLinkOf(document: AnchorDocument, key: string): AnchorLink | null {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  let link: AnchorLink | null = null;
  for (const joint of document.joints) {
    const parentAssembly = assemblyOf.get(joint.parent);
    if (
      assemblyOf.get(joint.child) === key &&
      parentAssembly !== undefined &&
      parentAssembly !== key
    ) {
      link = { anchor: parentAssembly, childBodyId: joint.child };
    }
  }
  return link;
}

/** The key of the assembly that `key` is anchored to; null: the world. */
export function anchorOfAssembly(document: AnchorDocument, key: string): string | null {
  return anchorLinkOf(document, key)?.anchor ?? null;
}
