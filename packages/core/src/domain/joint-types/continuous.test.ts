import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../../test-support/expect-point.ts";
import { apply } from "../rigid-transform.ts";
import { CONTINUOUS_BEHAVIOUR } from "./continuous.ts";

const spin: Extract<Joint, { type: "continuous" }> = {
  id: "spin",
  tagKey: "spin",
  type: "continuous",
  name: "Spin",
  parent: "base",
  child: "arm",
  origin: [1, 0, 0],
  axis: [0, 0, 1],
};

describe("continuous joint", () => {
  it("keeps any angle, several turns included", () => {
    expect(CONTINUOUS_BEHAVIOUR.clamp(spin, 100)).toBe(100);
  });

  it("rotates beyond one turn", () => {
    const motion = CONTINUOUS_BEHAVIOUR.motion(spin, 2 * Math.PI + Math.PI / 2);
    expectPoint(apply(motion, [2, 0, 0]), [1, 1, 0]);
  });
});
