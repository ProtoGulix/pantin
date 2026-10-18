import type { Assembly, Body, Joint } from "@pantin/protocol";
import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
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
// A joint from the body "b" to the group of assembly "p": moving b changes
// the assembly that anchors p, whose pose must not change.
const TURN = joint({
  id: "turn",
  parent: bodyEndpoint("b"),
  child: groupEndpoint("p"),
  origin: [0.2, 0.1, 0],
  axis: [0, 1, 0],
});

type Scenario = { name: string; bodies: Body[]; joints: Joint[] };

// `b` always moves from "o" to "n". Bodies are listed so that b comes first.
// A body that has a joint with a body of its assembly cannot move alone
// (ADR 0055 point 3), and an unjointed body takes the displacement of its new
// group, so only the unjointed and the group-parenting cases keep their pose.
const SCENARIOS: Scenario[] = [
  {
    name: "a free body into a world-anchored assembly whose body is listed after it",
    bodies: [body("b", "o", ABOUT_X), body("y", "n", ABOUT_Z)],
    joints: [],
  },
  {
    name: "the parent of another assembly's group, moving under another anchor",
    bodies: [body("b", "o", ABOUT_Z), body("y", "n"), body("p-body", "p", ABOUT_X)],
    joints: [TURN],
  },
  {
    name: "the parent of a group, rotated placements everywhere",
    bodies: [body("b", "o", ABOUT_DIAGONAL), body("y", "n", ABOUT_X), body("p-body", "p")],
    joints: [TURN],
  },
];

const POSITION_SETS = [
  new Map<string, number>(),
  new Map([["turn", 0.8]]),
  new Map([["turn", -1.7]]),
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
