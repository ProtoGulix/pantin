import type { Joint, PantinDocument } from "@pantin/protocol";
import {
  anchorSignature,
  computeWorldPlacements,
  deriveAssemblyAnchors,
} from "./assembly-anchors.ts";
import {
  apply,
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  isIdentityTransform,
  type RigidTransform,
  rotate,
  toPlacement,
  unitTransform,
} from "./rigid-transform.ts";

// Moving a body to another assembly (ADR 0033 point 7). No joint motion in
// the world changes if every frame is rewritten consistently, so no
// displacement changes and every displayed pose stays exact at any joint
// position. Hence the world placement of every assembly is kept, unlike a
// joint edit (keep-displayed-pose.ts) which changes displacements and has to
// be solved on a key body.

// `moved` is `document` with the body already in its new assembly, bodies and
// joints otherwise untouched.
export function reframeMovedBody(
  document: PantinDocument,
  moved: PantinDocument,
  bodyId: string,
): PantinDocument {
  const worlds = computeWorldPlacements(document);
  const worldOf = (key: string) => worlds.get(key) ?? IDENTITY_TRANSFORM;
  const before = document.bodies.find((body) => body.id === bodyId);
  const after = moved.bodies.find((body) => body.id === bodyId);
  if (before === undefined || after === undefined) {
    return moved;
  }
  // W(N) ∘ B' = W(O) ∘ B: the mesh stays where it was.
  const frameChange = compose(inverse(worldOf(after.assembly)), worldOf(before.assembly));
  const placement = compose(
    frameChange,
    before.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(before.placement),
  );
  const { placement: _previous, ...rest } = after;
  const body = isIdentityTransform(placement)
    ? rest
    : { ...rest, placement: toPlacement(placement) };
  // Frames of the joints of the body follow its mesh: B' ∘ B⁻¹ = W(N)⁻¹ ∘ W(O).
  const reframe = (joint: Joint): Joint =>
    joint.parent === bodyId
      ? {
          ...joint,
          origin: [...apply(frameChange, joint.origin)],
          axis: [...rotate(frameChange.rotation, joint.axis)],
        }
      : joint;
  const bodies = moved.bodies.map((candidate) => (candidate.id === bodyId ? body : candidate));
  const reframed = { ...moved, bodies, joints: moved.joints.map(reframe) };
  return keepAssemblyWorlds(reframed, document, worlds);
}

// Assemblies whose anchor changed get the placement that keeps their world
// placement; the old worlds are final, so no ordering is needed.
function keepAssemblyWorlds(
  document: PantinDocument,
  old: PantinDocument,
  worlds: ReadonlyMap<string, RigidTransform>,
): PantinDocument {
  const oldAnchors = deriveAssemblyAnchors(old);
  const newAnchors = deriveAssemblyAnchors(document);
  const assemblies = document.assemblies.map((assembly) => {
    if (anchorSignature(oldAnchors, assembly.key) === anchorSignature(newAnchors, assembly.key)) {
      return assembly;
    }
    const world = worlds.get(assembly.key) ?? IDENTITY_TRANSFORM;
    const anchor = newAnchors.get(assembly.key);
    const anchorWorld = anchor === undefined ? undefined : worlds.get(anchor.assembly);
    const relative = anchorWorld === undefined ? world : compose(inverse(anchorWorld), world);
    return { ...assembly, placement: toPlacement(relative) };
  });
  return { ...document, assemblies };
}
