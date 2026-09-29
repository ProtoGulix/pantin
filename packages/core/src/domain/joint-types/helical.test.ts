import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../../test-support/expect-point.ts";
import { apply } from "../rigid-transform.ts";
import { HELICAL_BEHAVIOUR } from "./helical.ts";

// A 5 mm pitch ball screw along Z, through (1, 0, 0), with 100 mm of travel.
const screw: Extract<Joint, { type: "helical" }> = {
  id: "screw",
  type: "helical",
  name: "Screw",
  parent: "frame",
  child: "nut",
  origin: [1, 0, 0],
  axis: [0, 0, 3],
  limits: [0, 0.1],
  pitch: 0.005,
};

describe("helical joint", () => {
  it("advances one pitch per turn: back to the same angle, one pitch higher", () => {
    const motion = HELICAL_BEHAVIOUR.motion(screw, 0.005);
    expectPoint(apply(motion, [2, 0, 0]), [2, 0, 0.005]);
  });

  it("turns a quarter turn for a quarter pitch, right-hand thread", () => {
    const motion = HELICAL_BEHAVIOUR.motion(screw, 0.00125);
    expectPoint(apply(motion, [2, 0, 0]), [1, 1, 0.00125]);
    expectPoint(apply(motion, [1, 0, 0]), [1, 0, 0.00125]); // a point on the axis
  });

  it("turns the other way with a left-hand thread", () => {
    const leftHand = { ...screw, pitch: -0.005 };
    expectPoint(apply(HELICAL_BEHAVIOUR.motion(leftHand, 0.00125), [2, 0, 0]), [1, -1, 0.00125]);
  });

  it.each([
    [0.05, 0.05],
    [0.2, 0.1],
    [-0.01, 0],
  ])("clamps a travel of %d to %d", (requested, expected) => {
    expect(HELICAL_BEHAVIOUR.clamp(screw, requested)).toBe(expected);
  });
});
