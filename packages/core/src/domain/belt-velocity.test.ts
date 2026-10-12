import { describe, expect, it } from "vitest";
import { beltSurfaceVelocity } from "./belt-velocity.ts";
import { axisAngleRotation, IDENTITY_TRANSFORM } from "./rigid-transform.ts";

describe("beltSurfaceVelocity", () => {
  it("is +X times radius times drum velocity", () => {
    expect(beltSurfaceVelocity(IDENTITY_TRANSFORM, 0.05, 10)).toEqual([0.5, 0, 0]);
  });

  it("follows the belt's current world frame", () => {
    const turned = { ...IDENTITY_TRANSFORM, rotation: axisAngleRotation([0, 0, 1], Math.PI / 2) };
    const [x, y, z] = beltSurfaceVelocity(turned, 0.05, 10);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0.5, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it("reverses with a negative drum velocity and stops at zero", () => {
    expect(beltSurfaceVelocity(IDENTITY_TRANSFORM, 0.05, -10)[0]).toBe(-0.5);
    expect(beltSurfaceVelocity(IDENTITY_TRANSFORM, 0.05, 0)).toEqual([0, 0, 0]);
  });
});
