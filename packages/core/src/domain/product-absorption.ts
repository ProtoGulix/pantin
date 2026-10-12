import { apply, inverse, type RigidTransform, type Vector3 } from "./rigid-transform.ts";

// Destruction of products (ADR 0043 point 6), on product poses: pure, no world query.

// A box that falls off a belt end is removed 10 m below the Pantin origin.
export const KILL_PLANE_Z = -10;

// `size` is laid out like a guide: bottom face at the frame origin, centred on
// the frame's Z axis.
export type AbsorberVolume = { id: string; pose: RigidTransform; size: Vector3 };

export type RemovedProduct =
  | { productId: string; reason: "absorbed"; absorberId: string }
  | { productId: string; reason: "fell" };

function isInside(volume: AbsorberVolume, centre: Vector3): boolean {
  const [x, y, z] = apply(inverse(volume.pose), centre);
  const [sizeX, sizeY, sizeZ] = volume.size;
  return Math.abs(x) <= sizeX / 2 && Math.abs(y) <= sizeY / 2 && z >= 0 && z <= sizeZ;
}

// `products` carry the pose of their centre. The first absorber (in the given
// order) that holds a centre wins; the result keeps the product order.
export function productsToRemove(
  products: readonly { productId: string; pose: RigidTransform }[],
  absorbers: readonly AbsorberVolume[],
): RemovedProduct[] {
  const removed: RemovedProduct[] = [];
  for (const { productId, pose } of products) {
    const absorber = absorbers.find((volume) => isInside(volume, pose.translation));
    if (absorber !== undefined) {
      removed.push({ productId, reason: "absorbed", absorberId: absorber.id });
    } else if (pose.translation[2] < KILL_PLANE_Z) {
      removed.push({ productId, reason: "fell" });
    }
  }
  return removed;
}
