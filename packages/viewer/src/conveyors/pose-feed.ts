import type { ObjectPose, PoseSnapshot } from "@pantin/protocol";

// The pose interpolator blends poses listed as bodies, by id. Products and
// phase 6 objects are fed to their own interpolators in that shape, so that
// their ids ("p1", "belt:feed") never meet body ids.

function asBodies(snapshot: PoseSnapshot, bodies: PoseSnapshot["bodies"]): PoseSnapshot {
  return { ...snapshot, jointPositions: [], products: [], objects: [], bodies };
}

export function productsAsPoseSnapshot(snapshot: PoseSnapshot): PoseSnapshot {
  return asBodies(
    snapshot,
    snapshot.products.map((product) => ({
      bodyId: product.productId,
      translation: product.translation,
      rotation: product.rotation,
    })),
  );
}

/** Key of an object in the interpolator and in the drawing: "kind:id". */
export function objectKey(kind: ObjectPose["kind"], id: string): string {
  return `${kind}:${id}`;
}

export function objectsAsPoseSnapshot(snapshot: PoseSnapshot): PoseSnapshot {
  return asBodies(
    snapshot,
    snapshot.objects.map((object) => ({
      bodyId: objectKey(object.kind, object.id),
      translation: object.translation,
      rotation: object.rotation,
    })),
  );
}
