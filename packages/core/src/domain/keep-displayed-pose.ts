import type { Body, PantinDocument } from "@pantin/protocol";
import {
  anchorSignature,
  computeWorldPlacements,
  deriveAssemblyAnchors,
} from "./assembly-anchors.ts";
import { computeDisplacements, computePoses } from "./kinematics.ts";
import {
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  type RigidTransform,
  toPlacement,
  unitTransform,
} from "./rigid-transform.ts";

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

// The topmost ancestor of `body` along joints whose parent is also in the
// assembly `key`: below it, every joint of the chain turns about W(key).
function topAncestorInAssembly(document: PantinDocument, key: string, body: Body): string {
  const assemblyOf = new Map(
    document.bodies.map((candidate) => [candidate.id, candidate.assembly]),
  );
  const parentJointOf = new Map(document.joints.map((joint) => [joint.child, joint]));
  let top = body.id;
  for (let joint = parentJointOf.get(top); joint !== undefined; joint = parentJointOf.get(top)) {
    if (assemblyOf.get(joint.parent) !== key) {
      break;
    }
    top = joint.parent;
  }
  return top;
}

/**
 * The placement of assembly `key` that gives `body`, one of its bodies, the
 * displayed pose `pose` at the current joint positions (ADR 0033 point 6,
 * reused by alignments, ADR 0035). The rest of the document is unchanged.
 *
 * With e the top ancestor of k inside X, D(e) does not depend on W(X), and
 * the joints from e down to k turn about W(X): D(k) = D(e) W M W⁻¹. The pose
 * T = D(k) W B then gives W = D(e)⁻¹ T B⁻¹ M⁻¹, and the placement is
 * A⁻¹ W, A being the world placement of the anchor (identity without one).
 * M is read at placement identity, where W = A: M = A⁻¹ D(e)⁻¹ D(k) A.
 */
export function placementGivingPose(
  document: PantinDocument,
  key: string,
  body: Body,
  pose: RigidTransform,
  positions: ReadonlyMap<string, number>,
): RigidTransform {
  const neutral = withPlacement(document, key, IDENTITY_TRANSFORM);
  const displacements = computeDisplacements(neutral, positions);
  const displacementOf = (bodyId: string) => displacements.get(bodyId) ?? IDENTITY_TRANSFORM;
  const top = displacementOf(topAncestorInAssembly(document, key, body));
  const anchor = deriveAssemblyAnchors(document).get(key);
  const anchorWorld =
    anchor === undefined
      ? IDENTITY_TRANSFORM
      : (computeWorldPlacements(neutral).get(anchor.assembly) ?? IDENTITY_TRANSFORM);
  const inside = compose(
    compose(inverse(anchorWorld), inverse(top)),
    compose(displacementOf(body.id), anchorWorld),
  );
  const target = compose(
    pose,
    inverse(body.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(body.placement)),
  );
  const world = compose(compose(inverse(top), target), inverse(inside));
  return compose(inverse(anchorWorld), world);
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
      const pose = before.get(body.id) ?? IDENTITY_TRANSFORM;
      document = withPlacement(
        document,
        key,
        placementGivingPose(document, key, body, pose, positions),
      );
    }
  }
  return document;
}
