import type { Joint, PantinDocument } from "@pantin/protocol";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { mapFramedItems } from "./group-shared.ts";
import { snapComponent } from "./joint-axis-from-face.ts";
import {
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  normalize,
  type Quaternion,
  type RigidTransform,
  rotate,
  toPlacement,
  unitTransform,
  type Vector3,
} from "./rigid-transform.ts";

// Reframing an assembly (ADR 0056 point 1). The frame F of assembly X becomes
// F ∘ R, the origin kept. Everything written in X's frame is rewritten by R⁻¹
// and X's placement by p ∘ R, so every displacement, pose and posed frame of
// what X holds is unchanged at every joint position, to rounding. Nothing is
// solved: a frame change is exact, unlike a joint edit (keep-displayed-pose).

function snapped([x, y, z]: Vector3): [number, number, number] {
  return [snapComponent(x), snapComponent(y), snapComponent(z)];
}

/** The joints whose numbers changed are the very objects that are new. */
function rewrittenJoint(
  joint: Joint,
  bodiesOfX: ReadonlySet<string>,
  key: string,
  toNewFrame: Quaternion,
): Joint {
  const { parent } = joint;
  const readInX = parent.kind === "assembly" ? parent.key === key : bodiesOfX.has(parent.id);
  if (!readInX) {
    return joint;
  }
  return {
    ...joint,
    origin: [...rotate(toNewFrame, joint.origin)],
    // Joint types normalise the axis when they use it, so unit length is safe
    // and lets an axis along a frame axis read exactly [0, 0, 1].
    axis: snapped(rotate(toNewFrame, normalize(joint.axis))),
  };
}

function reframedAssemblies(
  document: PantinDocument,
  key: string,
  turn: RigidTransform,
): PantinDocument["assemblies"] {
  const anchoredToX = new Set(
    [...deriveAssemblyAnchors(document)]
      .filter(([anchored, anchor]) => anchored !== key && anchor.assembly === key)
      .map(([anchored]) => anchored),
  );
  return document.assemblies.map((assembly) => {
    const own = unitTransform(assembly.placement);
    if (assembly.key === key) {
      return { ...assembly, placement: toPlacement(compose(own, turn)) };
    }
    return anchoredToX.has(assembly.key)
      ? { ...assembly, placement: toPlacement(compose(inverse(turn), own)) }
      : assembly;
  });
}

function reframedBodies(
  document: PantinDocument,
  key: string,
  back: RigidTransform,
): PantinDocument["bodies"] {
  return document.bodies.map((body) => {
    if (body.assembly !== key) {
      return body;
    }
    const own = body.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(body.placement);
    return { ...body, placement: toPlacement(compose(back, own)) };
  });
}

export function reframeAssembly(
  document: PantinDocument,
  key: string,
  rotation: Quaternion,
): PantinDocument {
  const turn = { rotation, translation: [0, 0, 0] as const };
  const back = inverse(turn);
  const bodiesOfX = new Set(
    document.bodies.filter((body) => body.assembly === key).map((body) => body.id),
  );
  const reframed: PantinDocument = {
    ...document,
    assemblies: reframedAssemblies(document, key, turn),
    bodies: reframedBodies(document, key, back),
    joints: document.joints.map((joint) => rewrittenJoint(joint, bodiesOfX, key, back.rotation)),
  };
  return mapFramedItems(reframed, (item) =>
    item.assembly === key && item.body === undefined
      ? { ...item, placement: toPlacement(compose(back, unitTransform(item.placement))) }
      : item,
  );
}
