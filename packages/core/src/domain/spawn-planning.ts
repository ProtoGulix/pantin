import { boxesOverlap, type OrientedBox } from "./box-overlap.ts";
import type { SpawnRequest } from "./physics-world.ts";
import { apply, type RigidTransform, type Vector3 } from "./rigid-transform.ts";

// Which queued emitter spawns happen at the next step (ADR 0043 point 5).
// Pure: the occupied boxes and the counter come in, the requests and the new
// counter go out.

// The ADR 0005 budget: a Pantin holds at most this many products.
export const PRODUCT_LIMIT = 500;

export type QueuedSpawn = {
  emitterId: string;
  // The emitter frame in the world.
  pose: RigidTransform;
  size: Vector3;
  mass: number;
};

type SkippedSpawn = {
  emitterId: string;
  reason: "emitter_blocked" | "product_limit";
};

type PlannedSpawn = SpawnRequest & { emitterId: string };

export type SpawnPlan = {
  requests: PlannedSpawn[];
  skipped: SkippedSpawn[];
  // The number the next product will take: products are p1, p2, ...
  nextProductNumber: number;
};

// The box a spawn would occupy: bottom face centred on the emitter frame origin.
function spawnedBox(spawn: QueuedSpawn): OrientedBox {
  return {
    centre: apply(spawn.pose, [0, 0, spawn.size[2] / 2]),
    rotation: spawn.pose.rotation,
    size: spawn.size,
  };
}

// Emitters are served in id order, whatever the order they were queued in
// (plain code unit comparison: no locale, same on every machine). A spawn is
// blocked when its box overlaps a current product or a box spawned earlier in
// this plan; products over the limit are counted the same way. A skipped spawn
// takes no product number.
export function planSpawns(
  queued: readonly QueuedSpawn[],
  products: readonly OrientedBox[],
  nextProductNumber: number,
): SpawnPlan {
  const ordered = [...queued].sort((a, b) =>
    a.emitterId < b.emitterId ? -1 : a.emitterId > b.emitterId ? 1 : 0,
  );
  const occupied = [...products];
  const plan: SpawnPlan = { requests: [], skipped: [], nextProductNumber };
  for (const spawn of ordered) {
    const box = spawnedBox(spawn);
    if (occupied.length >= PRODUCT_LIMIT) {
      plan.skipped.push({ emitterId: spawn.emitterId, reason: "product_limit" });
    } else if (occupied.some((other) => boxesOverlap(box, other))) {
      plan.skipped.push({ emitterId: spawn.emitterId, reason: "emitter_blocked" });
    } else {
      occupied.push(box);
      plan.requests.push({
        productId: `p${plan.nextProductNumber}`,
        emitterId: spawn.emitterId,
        pose: spawn.pose,
        size: spawn.size,
        mass: spawn.mass,
      });
      plan.nextProductNumber += 1;
    }
  }
  return plan;
}
