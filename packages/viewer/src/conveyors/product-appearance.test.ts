import { PRODUCT_MATERIALS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PRODUCT_LOOKS, productBoxDimensions, productSizeKey } from "./product-appearance.ts";

describe("PRODUCT_LOOKS", () => {
  it("has a colour for every material, all different", () => {
    for (const material of PRODUCT_MATERIALS) {
      expect(PRODUCT_LOOKS[material].albedo).toMatch(/^#[0-9a-f]{6}$/);
    }
    const colours = new Set(PRODUCT_MATERIALS.map((material) => PRODUCT_LOOKS[material].albedo));
    expect(colours.size).toBe(PRODUCT_MATERIALS.length);
  });

  it("keeps metals low in metallic, since the scene has no environment to reflect", () => {
    for (const material of PRODUCT_MATERIALS) {
      expect(PRODUCT_LOOKS[material].metallic).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("productBoxDimensions", () => {
  it("swaps Y and Z: core height becomes Babylon height", () => {
    expect(productBoxDimensions([0.4, 0.3, 0.2])).toEqual({ width: 0.4, height: 0.2, depth: 0.3 });
  });
});

describe("productSizeKey", () => {
  it("tells two sizes apart", () => {
    expect(productSizeKey({ size: [1, 2, 3] })).not.toBe(productSizeKey({ size: [1, 2, 4] }));
  });
});
