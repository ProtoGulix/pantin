import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../../test-support/expect-point.ts";
import { PRISMATIC_BEHAVIOUR } from "./prismatic.ts";

const slide: Extract<Joint, { type: "prismatic" }> = {
  id: "slide",
  tagKey: "slide",
  type: "prismatic",
  name: "Slide",
  parent: "base",
  child: "arm",
  origin: [0, 0, 0],
  axis: [2, 0, 0],
  limits: [0, 0.8],
};

describe("prismatic joint", () => {
  it.each([
    [0.4, 0.4],
    [1, 0.8],
    [-0.1, 0],
  ])("clamps %d to %d", (requested, expected) => {
    expect(PRISMATIC_BEHAVIOUR.clamp(slide, requested)).toBe(expected);
  });

  it("translates along its normalised axis, without rotating", () => {
    const motion = PRISMATIC_BEHAVIOUR.motion(slide, 0.4);
    expect(motion.rotation).toEqual([0, 0, 0, 1]);
    expectPoint(motion.translation, [0.4, 0, 0]);
  });
});
