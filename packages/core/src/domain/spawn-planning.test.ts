import { describe, expect, it } from "vitest";
import type { OrientedBox } from "./box-overlap.ts";
import { axisAngleRotation, IDENTITY_TRANSFORM } from "./rigid-transform.ts";
import { PRODUCT_LIMIT, planSpawns, type QueuedSpawn } from "./spawn-planning.ts";

const queued = (emitterId: string, x = 0, y = 0): QueuedSpawn => ({
  emitterId,
  pose: { ...IDENTITY_TRANSFORM, translation: [x, y, 0] },
  size: [0.4, 0.2, 0.2],
  mass: 1,
});
const box = (x: number, y = 0, z = 0.1): OrientedBox => ({
  centre: [x, y, z],
  rotation: [0, 0, 0, 1],
  size: [0.4, 0.2, 0.2],
});

describe("planSpawns", () => {
  it("assigns product numbers from the counter, in emitter id order", () => {
    const plan = planSpawns([queued("e2", 5), queued("e1", 0)], [], 7);
    expect(plan.requests.map((request) => [request.productId, request.emitterId])).toEqual([
      ["p7", "e1"],
      ["p8", "e2"],
    ]);
    expect(plan.nextProductNumber).toBe(9);
    expect(plan.skipped).toEqual([]);
  });

  it("skips a spawn that would overlap a product, with no number taken", () => {
    const plan = planSpawns([queued("e1", 0.3), queued("e2", 3)], [box(0)], 1);
    expect(plan.skipped).toEqual([{ emitterId: "e1", reason: "emitter_blocked" }]);
    expect(plan.requests.map((request) => request.productId)).toEqual(["p1"]);
    expect(plan.nextProductNumber).toBe(2);
  });

  it("lets a box spawn next to a product it only touches", () => {
    expect(planSpawns([queued("e1", 0.4)], [box(0)], 1).requests).toHaveLength(1);
  });

  it("blocks the second of two emitters at the same place", () => {
    const plan = planSpawns([queued("e1"), queued("e2")], [], 1);
    expect(plan.requests.map((request) => request.emitterId)).toEqual(["e1"]);
    expect(plan.skipped).toEqual([{ emitterId: "e2", reason: "emitter_blocked" }]);
  });

  it("refuses a spawn at the product limit", () => {
    const products = Array.from({ length: PRODUCT_LIMIT }, (_, index) => box(10 + index));
    const plan = planSpawns([queued("e1")], products, 501);
    expect(plan.skipped).toEqual([{ emitterId: "e1", reason: "product_limit" }]);
    expect(plan.nextProductNumber).toBe(501);
    const room = planSpawns([queued("e1"), queued("e2", 3)], products.slice(1), 501);
    expect(room.requests.map((request) => request.emitterId)).toEqual(["e1"]);
    expect(room.skipped).toEqual([{ emitterId: "e2", reason: "product_limit" }]);
  });

  it("builds the box from the frame: bottom face on the origin, axes along the frame", () => {
    const turned: QueuedSpawn = {
      ...queued("e1", 1),
      pose: { rotation: axisAngleRotation([0, 0, 1], Math.PI / 2), translation: [1, 0, 0.5] },
    };
    // Turned, the 0.4 m side lies along Y: a product 0.3 m to the side in Y is hit, in X it is not.
    expect(planSpawns([turned], [box(1, 0.25, 0.6)], 1).skipped).toHaveLength(1);
    expect(planSpawns([turned], [box(1.3, 0, 0.6)], 1).skipped).toHaveLength(0);
    // 0.25 m above the frame origin: the spawn box spans 0.5 to 0.7 in Z.
    expect(planSpawns([turned], [box(1, 0, 0.9)], 1).skipped).toHaveLength(0);
  });
});
