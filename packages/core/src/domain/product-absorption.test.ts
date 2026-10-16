import { describe, expect, it } from "vitest";
import { type AbsorberVolume, KILL_PLANE_Z, productsToRemove } from "./product-absorption.ts";
import { axisAngleRotation, IDENTITY_TRANSFORM, type RigidTransform } from "./rigid-transform.ts";

const product = (
  productId: string,
  x: number,
  y: number,
  z: number,
): { productId: string; pose: RigidTransform } => ({
  productId,
  pose: { ...IDENTITY_TRANSFORM, translation: [x, y, z] },
});
const absorber: AbsorberVolume = {
  id: "a1",
  pose: { ...IDENTITY_TRANSFORM, translation: [2, 0, 0] },
  size: [0.4, 0.6, 0.3],
};

describe("productsToRemove", () => {
  it("absorbs a product whose centre is inside, bottom face at the origin", () => {
    const removed = productsToRemove(
      [product("p1", 2.1, 0.2, 0.1), product("p2", 2.1, 0, 0.35)],
      [absorber],
    );
    expect(removed).toEqual([{ productId: "p1", reason: "absorbed", absorberId: "a1" }]);
  });

  it("keeps a product whose centre is outside even if its box would overlap", () => {
    expect(productsToRemove([product("p1", 2.25, 0, 0.1)], [absorber])).toEqual([]);
    expect(productsToRemove([product("p1", 1.9, 0, -0.01)], [absorber])).toEqual([]);
  });

  it("follows the absorber frame", () => {
    const turned: AbsorberVolume = {
      ...absorber,
      pose: { rotation: axisAngleRotation([0, 0, 1], Math.PI / 2), translation: [0, 0, 0] },
      size: [0.2, 2, 1],
    };
    // Long side along world X once turned a quarter turn about Z.
    expect(productsToRemove([product("p1", 0.8, 0, 0.5)], [turned])).toHaveLength(1);
    expect(productsToRemove([product("p1", 0, 0.8, 0.5)], [turned])).toHaveLength(0);
  });

  it("removes products more than 10 m below the origin", () => {
    const removed = productsToRemove(
      [product("p1", 0, 0, KILL_PLANE_Z), product("p2", 0, 0, KILL_PLANE_Z - 0.001)],
      [],
    );
    expect(removed).toEqual([{ productId: "p2", reason: "fell" }]);
  });

  it("keeps the product order", () => {
    const removed = productsToRemove(
      [product("p3", 2, 0, 0.1), product("p1", 0, 0, -20), product("p2", 2, 0, 0.1)],
      [absorber],
    );
    expect(removed.map((entry) => entry.productId)).toEqual(["p3", "p1", "p2"]);
  });
});
