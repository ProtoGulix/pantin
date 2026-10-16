import { describe, expect, it } from "vitest";
import type { ProductRecord } from "./physics-state.ts";
import { toProductPoses } from "./product-poses.ts";

const record = (id: string, height: number): ProductRecord => ({
  id,
  emitterId: "source",
  size: [0.3, 0.2, 0.1],
  mass: 2,
  material: "wood",
  pose: { translation: [1, 2, height], rotation: [0, 0, 0, 1] },
});

describe("toProductPoses", () => {
  it("lists products in the order given, with only the fields clients draw", () => {
    expect(toProductPoses([record("p2", 0.5), record("p1", 0.1)])).toEqual([
      {
        productId: "p2",
        emitterId: "source",
        size: [0.3, 0.2, 0.1],
        material: "wood",
        translation: [1, 2, 0.5],
        rotation: [0, 0, 0, 1],
      },
      expect.objectContaining({ productId: "p1" }),
    ]);
  });

  it("leaves the mass out", () => {
    expect(toProductPoses([record("p1", 0)])[0]).not.toHaveProperty("mass");
  });
});

describe("toProductPoses precision", () => {
  const at = (
    translation: [number, number, number],
    rotation: [number, number, number, number],
  ) => ({
    ...record("p1", 0),
    pose: { translation, rotation },
  });

  it("rounds the pose to a micrometre and a millionth, so that resting creep is not motion", () => {
    const creeping = at([1, 2, 0.05 + 4e-9], [3e-10, 0, 0, 1 - 1e-10]);
    const still = at([1, 2, 0.05], [0, 0, 0, 1]);
    expect(toProductPoses([creeping])).toEqual(toProductPoses([still]));
  });

  it("gives the nearest decimal, not a float sum", () => {
    expect(toProductPoses([at([0.3000004, 0, 0], [0, 0, 0, 1])])[0]?.translation).toEqual([
      0.3, 0, 0,
    ]);
  });
});
