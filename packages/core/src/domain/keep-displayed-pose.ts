import type { Body, PantinDocument, Placement } from "@pantin/protocol";
import {
  anchorSignature,
  computeWorldPlacements,
  deriveAssemblyAnchors,
} from "./assembly-anchors.ts";
import { computeDisplacements, computePoses } from "./kinematics.ts";
import { compose, IDENTITY_TRANSFORM, inverse, type RigidTransform } from "./rigid-transform.ts";

// Joint edits keep what is on screen (ADR 0033 point 6; body moves are in
// move-body-frames.ts). "On screen" is the displayed pose, joint displacements
// at their current positions included, not only the reference configuration:
// so every edit here takes the current joint positions.
//
// An assembly X whose anchor changed gets a key body k, and W(X) is chosen so
// that k keeps its displayed pose T(k) = D(k) ∘ W(X) ∘ B(k). That is enough
// for the bodies of k's subtree and for every assembly anchored below, whose
// placements are relative. Bodies of X outside k's subtree may shift when
// joint displacements are not identity: accepted, the user did not ask for
// them to stay and no single frame can hold two displaced subtrees.

type Anchors = ReturnType<typeof deriveAssemblyAnchors>;
type Poses = ReadonlyMap<string, RigidTransform>;

function affectedAssemblies(oldDocument: PantinDocument, newDocument: PantinDocument): Set<string> {
  const oldAnchors = deriveAssemblyAnchors(oldDocument);
  const newAnchors = deriveAssemblyAnchors(newDocument);
  const affected = new Set<string>();
  for (const { key } of newDocument.assemblies) {
    if (anchorSignature(oldAnchors, key) !== anchorSignature(newAnchors, key)) {
      affected.add(key);
    }
  }
  return affected;
}

function keyBody(
  key: string,
  oldAnchors: Anchors,
  newAnchors: Anchors,
  document: PantinDocument,
): Body | undefined {
  const inAssembly = document.bodies.filter((body) => body.assembly === key);
  const preferred = [newAnchors.get(key), oldAnchors.get(key)].map((anchor) => anchor?.joint.child);
  for (const childId of preferred) {
    const body = inAssembly.find((candidate) => candidate.id === childId);
    if (body !== undefined) {
      return body;
    }
  }
  return inAssembly[0];
}

// Placements are stored as plain arrays, like every document value.
function toPlacement({ rotation, translation }: RigidTransform): Placement {
  return { rotation: [...rotation], translation: [...translation] };
}

function withPlacement(document: PantinDocument, key: string, placement: RigidTransform) {
  const assemblies = document.assemblies.map((assembly) =>
    assembly.key === key ? { ...assembly, placement: toPlacement(placement) } : assembly,
  );
  return { ...document, assemblies };
}

function anchorDepth(anchors: Anchors, key: string): number {
  let depth = 0;
  for (let anchor = anchors.get(key); anchor !== undefined; anchor = anchors.get(anchor.assembly)) {
    depth += 1;
  }
  return depth;
}

function reanchorAssembly(
  document: PantinDocument,
  key: string,
  body: Body,
  anchors: Anchors,
  before: Poses,
  positions: ReadonlyMap<string, number>,
): PantinDocument {
  // D(k) must not depend on the placement being solved for.
  const neutral = withPlacement(document, key, IDENTITY_TRANSFORM);
  const displacement = computeDisplacements(neutral, positions).get(body.id) ?? IDENTITY_TRANSFORM;
  const target = compose(
    before.get(body.id) ?? IDENTITY_TRANSFORM,
    inverse(body.placement ?? IDENTITY_TRANSFORM),
  );
  const anchor = anchors.get(key);
  if (anchor === undefined) {
    // Unanchored: joints inside X turn about W(X) too, so D(k) = W M W⁻¹ and
    // the pose T = W M B gives W = T B⁻¹ M⁻¹, M being D(k) computed at W = I.
    return withPlacement(document, key, compose(target, inverse(displacement)));
  }
  // Anchored: k's chain never re-enters X, D(k) does not depend on W(X).
  const world = compose(inverse(displacement), target);
  const anchorWorld = computeWorldPlacements(neutral).get(anchor.assembly) ?? IDENTITY_TRANSFORM;
  return withPlacement(document, key, compose(inverse(anchorWorld), world));
}

// `newDocument` is `oldDocument` after the structural edit, placements still
// the old ones. Returns the document whose displayed pose is the old one.
// Body moves do not come here: they change no displacement and keep every
// world placement instead (move-body-frames.ts), which is exact at any
// positions, whereas a joint edit changes D and has to be solved on a key body.
export function keepDisplayedPose(
  oldDocument: PantinDocument,
  newDocument: PantinDocument,
  positions: ReadonlyMap<string, number>,
): PantinDocument {
  const affected = affectedAssemblies(oldDocument, newDocument);
  if (affected.size === 0) {
    return newDocument;
  }
  const before = new Map(
    computePoses(oldDocument, positions).map(({ bodyId, rotation, translation }) => [
      bodyId,
      { rotation, translation },
    ]),
  );
  const oldAnchors = deriveAssemblyAnchors(oldDocument);
  const newAnchors = deriveAssemblyAnchors(newDocument);
  // Anchors first: an assembly is solved against the final world of its anchor.
  const ordered = [...affected].sort(
    (a, b) => anchorDepth(newAnchors, a) - anchorDepth(newAnchors, b),
  );
  let document = newDocument;
  for (const key of ordered) {
    const body = keyBody(key, oldAnchors, newAnchors, document);
    if (body !== undefined) {
      document = reanchorAssembly(document, key, body, newAnchors, before, positions);
    }
  }
  return document;
}
