import { describe, expect, it } from "vitest";
import { planJointArrowParts } from "./joint-arrow-plan.ts";

describe("planJointArrowParts", () => {
  it("draws a dot, a shaft and a head for a free joint", () => {
    expect(planJointArrowParts(1, false).map((part) => part.kind)).toEqual([
      "shaft",
      "head",
      "origin",
    ]);
  });

  it("adds a collar disc around the shaft's base for a driven joint, wider than the head", () => {
    const parts = planJointArrowParts(1, true);
    const collar = parts.find((part) => part.kind === "collar");
    const head = parts.find((part) => part.kind === "head");
    const shaft = parts.find((part) => part.kind === "shaft");
    expect(collar?.diameter).toBeGreaterThan(head?.diameter ?? 0);
    expect(collar?.centreY).toBeLessThan((shaft?.height ?? 0) / 2);
    expect(collar?.height).toBeLessThan(collar?.diameter ?? 0);
  });

  it("scales every part with the length", () => {
    const [shaft] = planJointArrowParts(2, true);
    expect(shaft).toMatchObject({ height: 1.6, diameter: 0.04 });
  });
});
