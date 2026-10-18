import { endpointAssemblyIn, type PantinDocument } from "@pantin/protocol";
import { endpointBodyId, groupRepresentatives } from "./joint-bodies.ts";

// Mirrors deriveAssemblyAnchors of the core (packages/core/src/domain/
// assembly-anchors.ts), which the viewer cannot import (CLAUDE.md section 3.4).
// ADR 0033 point 2, amended by ADR 0055: an assembly is anchored by the joint
// between assemblies whose child is that assembly as a group, and the anchor
// is the assembly of that joint's parent. The anchor is derived, never stored;
// the core refuses a document where it would be ambiguous, so the last such
// joint wins here exactly as it does there.

type AnchorDocument = Pick<PantinDocument, "bodies" | "joints">;

export interface AnchorLink {
  // Key of the anchor assembly.
  anchor: string;
  // The anchoring joint.
  jointId: string;
  // The body that stands for the anchored group: it follows the joint's motion.
  childBodyId: string;
}

/** The link that anchors the assembly `key` to another assembly; null: the world. */
export function anchorLinkOf(document: AnchorDocument, key: string): AnchorLink | null {
  let link: AnchorLink | null = null;
  for (const joint of document.joints) {
    const parentAssembly = endpointAssemblyIn(joint.parent, document.bodies);
    if (
      endpointAssemblyIn(joint.child, document.bodies) === key &&
      parentAssembly !== undefined &&
      parentAssembly !== key
    ) {
      link = {
        anchor: parentAssembly,
        jointId: joint.id,
        childBodyId: endpointBodyId(groupRepresentatives(document), joint.child),
      };
    }
  }
  return link;
}

/** The key of the assembly that `key` is anchored to; null: the world. */
export function anchorOfAssembly(document: AnchorDocument, key: string): string | null {
  return anchorLinkOf(document, key)?.anchor ?? null;
}
