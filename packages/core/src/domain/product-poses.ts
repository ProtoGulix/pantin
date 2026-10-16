import type { ProductPose } from "@pantin/protocol";
import type { ProductRecord } from "./physics-state.ts";

// A box resting on a belt that stands still creeps by about 1e-9 m and 1e-10
// rad per step (products never sleep, ADR 0043 point 9). Sent as is, that would
// make every step "motion" and flood the stream of an idle machine (ADR 0015).
// Poses are therefore rounded to a micrometre and a millionth of a unit
// quaternion component (far below what a screen shows); the physics state
// keeps its full precision. This also shortens the payload.
// Multiplying then dividing by a whole number gives the double nearest the
// decimal (0.3, not 0.30000000000000004).
const POSE_STEPS_PER_UNIT = 1e6;

export const quantised = (value: number): number =>
  Math.round(value * POSE_STEPS_PER_UNIT) / POSE_STEPS_PER_UNIT;

// Products as the pose response lists them (ADR 0043 point 12): in spawn
// order, with only what a client needs to draw a box.
export function toProductPoses(products: readonly ProductRecord[]): ProductPose[] {
  return products.map((product) => {
    const [x, y, z] = product.pose.translation;
    const [qx, qy, qz, qw] = product.pose.rotation;
    return {
      productId: product.id,
      emitterId: product.emitterId,
      size: [...product.size],
      material: product.material,
      translation: [quantised(x), quantised(y), quantised(z)],
      rotation: [quantised(qx), quantised(qy), quantised(qz), quantised(qw)],
    };
  });
}
