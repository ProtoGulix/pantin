import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../../test-support/expect-point.ts";
import { apply } from "../rigid-transform.ts";
import { REVOLUTE_BEHAVIOUR } from "./revolute.ts";

const hinge: Extract<Joint, { type: "revolute" }> = {
  id: "hinge",
  type: "revolute",
  name: "Hinge",
  parent: "base",
  child: "arm",
  origin: [1, 0, 0],
  axis: [0, 0, 1],
  limits: [-Math.PI, Math.PI],
};

describe("revolute joint", () => {
  it.each([
    [4, Math.PI],
    [-4, -Math.PI],
    [1, 1],
  ])("clamps %d to %d", (requested, expected) => {
    expect(REVOLUTE_BEHAVIOUR.clamp(hinge, requested)).toBe(expected);
  });

  it("rotates about the axis through its origin", () => {
    const motion = REVOLUTE_BEHAVIOUR.motion(hinge, Math.PI / 2);
    expectPoint(apply(motion, [1, 0, 0]), [1, 0, 0]); // the origin does not move
    expectPoint(apply(motion, [2, 0, 0]), [1, 1, 0]);
    expectPoint(apply(motion, [1, 0, 5]), [1, 0, 5]); // a point on the axis
  });

  it("normalises its axis", () => {
    const scaled = { ...hinge, axis: [0, 0, 7] as [number, number, number] };
    expectPoint(apply(REVOLUTE_BEHAVIOUR.motion(scaled, Math.PI / 2), [2, 0, 0]), [1, 1, 0]);
  });
});
