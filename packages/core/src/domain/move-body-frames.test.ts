import type { Assembly, Body, Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  expectSamePoses,
  joint,
} from "../test-support/placed-fixtures.ts";
import { moveBody } from "./assembly-edits.ts";

// Moving a body changes no displayed pose at any joint position (ADR 0033
// point 7): world placements are kept and the frames rewritten around them.

const ASSEMBLIES: Assembly[] = [
  assembly("p", ABOUT_Z),
  assembly("o", ABOUT_X),
  assembly("n", ABOUT_DIAGONAL),
];
const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: "p-body",
  child: "b",
  axis: [1, 0, 0],
  limits: [0, 1],
});
const TURN = joint({ id: "turn", parent: "b", child: "c", origin: [0.2, 0.1, 0], axis: [0, 1, 0] });

type Scenario = { name: string; bodies: Body[]; joints: Joint[] };

// `b` always moves from "o" to "n". Bodies are listed so that b comes first.
const SCENARIOS: Scenario[] = [
  {
    name: "a free body into a world-anchored assembly whose body is listed after it",
    bodies: [body("b", "o", ABOUT_X), body("y", "n", ABOUT_Z)],
    joints: [],
  },
  {
    name: "a body with its parent in a third assembly, becoming the anchoring child of n",
    bodies: [body("b", "o", ABOUT_X), body("y", "n"), body("p-body", "p")],
    joints: [SLIDE],
  },
  {
    name: "a body under a body of a third assembly, with a sibling left in o",
    bodies: [body("b", "o"), body("o-body", "o", ABOUT_Z), body("y", "n"), body("p-body", "p")],
    joints: [SLIDE],
  },
  {
    name: "a body that is the parent of the anchoring child of n (revolute)",
    bodies: [body("b", "o", ABOUT_Z), body("c", "n", ABOUT_DIAGONAL)],
    joints: [TURN],
  },
  {
    name: "a body with a child in o and a parent in p, rotated placements",
    bodies: [body("b", "o", ABOUT_DIAGONAL), body("c", "o"), body("p-body", "p", ABOUT_X)],
    joints: [SLIDE, TURN],
  },
];

const POSITION_SETS = [
  new Map<string, number>(),
  new Map([
    ["slide", 0.3],
    ["turn", 0.8],
  ]),
  new Map([
    ["slide", 0.9],
    ["turn", -1.7],
  ]),
];

describe("moveBody keeps every displayed pose", () => {
  it.each(SCENARIOS)("$name", ({ bodies, joints }) => {
    const before = documentOf(joints, bodies, ASSEMBLIES);
    const moved = moveBody(before, "b", "n");
    expect(moved.bodies.find((item) => item.id === "b")?.assembly).toBe("n");
    for (const positions of POSITION_SETS) {
      expectSamePoses(moved, before, positions);
    }
  });
});
