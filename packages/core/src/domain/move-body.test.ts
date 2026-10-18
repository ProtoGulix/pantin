import { type Actuator, bodyEndpoint, groupEndpoint, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
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
import { createAssembly } from "./assembly-edits.ts";
import { moveBody } from "./move-body.ts";

// Moving a body to another assembly (ADR 0055 point 11): the displayed pose
// stays at every joint position, its fixed joints to the old assembly are
// deleted and listed, and a case that cannot keep the pose is refused.
//
// A slider moves the group "x" from the handle "p0" of "p". The group "y" is
// fixed to "x", so it moves with it; "z" is a group nothing moves. "x" holds
// "xh" (unjointed), "xs" (fixed to "xh") and "xr" (a ring turning about "xh").

const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: bodyEndpoint("p0"),
  child: groupEndpoint("x"),
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 1],
});
const HOLD = joint({
  id: "hold",
  type: "fixed",
  parent: groupEndpoint("x"),
  child: groupEndpoint("y"),
});
const WELD = joint({
  id: "weld",
  type: "fixed",
  parent: bodyEndpoint("xh"),
  child: bodyEndpoint("xs"),
});
const RING = joint({ id: "ring", parent: bodyEndpoint("xh"), child: bodyEndpoint("xr") });
const POSITIONS = new Map([["slide", 0.3]]);

const document = (extra: Partial<PantinDocument> = {}) =>
  documentOf(
    [SLIDE, HOLD, WELD],
    [
      body("p0", "p"),
      body("xh", "x", ABOUT_DIAGONAL),
      body("xs", "x", ABOUT_X),
      body("xr", "x"),
      body("ya", "y", ABOUT_Z),
      body("za", "z"),
    ],
    [
      assembly("p", ABOUT_Z),
      assembly("x", ABOUT_X),
      assembly("y", ABOUT_DIAGONAL),
      assembly("z", ABOUT_Z),
    ],
    extra,
  );

function conflictMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("conflict");
    return (error as ApiError).message;
  }
  throw new Error("Expected the move to be refused.");
}

describe("a body with no parent joint", () => {
  it("keeps its pose at every position when the new group moves with the old one", () => {
    const before = document();
    const { document: after, deletedJoints } = moveBody(before, "xh", "y");
    expect(deletedJoints.map(({ id }) => id)).toEqual(["weld"]);
    expect(after.bodies.find(({ id }) => id === "xh")?.assembly).toBe("y");
    expectSamePoses(after, before, POSITIONS, ["xh", "ya", "p0"]);
  });

  it("keeps its pose when neither group is moved by any joint", () => {
    const before = documentOf(
      [],
      [body("a", "p", ABOUT_X), body("b", "z", ABOUT_Z)],
      [assembly("p", ABOUT_Z), assembly("z", ABOUT_DIAGONAL)],
    );
    const { document: after, deletedJoints } = moveBody(before, "a", "z");
    expect(deletedJoints).toEqual([]);
    expectSamePoses(after, before, new Map());
  });

  it("is refused when the new group does not move with the old one, naming the joint", () => {
    const toStill = conflictMessage(() => moveBody(document({ joints: [SLIDE, HOLD] }), "xh", "z"));
    expect(toStill).toContain('joint "slide" moves "x"');
    expect(toStill).toContain('assembly "z" never moves');
    const fromStill = conflictMessage(() => moveBody(document({ joints: [SLIDE] }), "za", "x"));
    expect(fromStill).toContain('assembly "z" never moves');
  });

  it("answers an unknown body or assembly with not found, and stays put without change", () => {
    const value = document();
    expect(() => moveBody(value, "ghost", "x")).toThrow('no body "ghost"');
    expect(() => moveBody(value, "xh", "ghost")).toThrow('no assembly "ghost"');
    expect(moveBody(value, "xh", "x")).toEqual({ document: value, deletedJoints: [] });
  });
});

describe("the fixed joints to the old assembly", () => {
  it("are deleted and listed, the body keeping its pose", () => {
    const before = document();
    const { document: after, deletedJoints } = moveBody(before, "xs", "y");
    expect(deletedJoints.map(({ id }) => id)).toEqual(["weld"]);
    expect(after.joints.map(({ id }) => id)).toEqual(["slide", "hold"]);
    expectSamePoses(after, before, POSITIONS);
  });

  it("are deleted when the body is their parent, the child then following its group", () => {
    const before = document();
    const { document: after, deletedJoints } = moveBody(before, "xh", "y");
    expect(deletedJoints.map(({ id }) => id)).toEqual(["weld"]);
    expectSamePoses(after, before, POSITIONS);
  });

  it("are kept when they link the body to another assembly", () => {
    const tie = joint({
      id: "tie",
      type: "fixed",
      parent: bodyEndpoint("xh"),
      child: groupEndpoint("z"),
    });
    const before = document({ joints: [SLIDE, HOLD, tie] });
    const { document: after, deletedJoints } = moveBody(before, "xh", "y");
    expect(deletedJoints).toEqual([]);
    expect(after.joints.map(({ id }) => id)).toEqual(["slide", "hold", "tie"]);
    expectSamePoses(after, before, POSITIONS);
  });

  it("are never deleted when something refers to them, the answer naming the item", () => {
    const actuator: Actuator = {
      id: "cylinder",
      name: "Cylinder",
      assembly: "x",
      type: "double_acting_cylinder",
      extendSpeed: 0.2,
      retractSpeed: 0.2,
      joints: ["weld"],
    };
    const message = conflictMessage(() => moveBody(document({ actuators: [actuator] }), "xs", "y"));
    expect(message).toContain('Joint "weld" is moved by actuator "cylinder"');
  });
});

describe("a moving joint to the old assembly", () => {
  it("refuses the move, naming the joint", () => {
    const message = conflictMessage(() =>
      moveBody(document({ joints: [SLIDE, HOLD, RING] }), "xr", "y"),
    );
    expect(message).toContain('Joint "ring"');
    expect(message).toContain("moves");
  });
});

describe("a body fixed to a body that a joint moves", () => {
  it("is refused rather than left behind, naming the joint", () => {
    const chain = document({
      joints: [
        SLIDE,
        HOLD,
        joint({
          id: "arm",
          type: "prismatic",
          parent: bodyEndpoint("xh"),
          child: bodyEndpoint("xr"),
          axis: [0, 1, 0],
          limits: [0, 1],
        }),
        joint({
          id: "tip",
          type: "fixed",
          parent: bodyEndpoint("xr"),
          child: bodyEndpoint("xs"),
        }),
      ],
    });
    expect(conflictMessage(() => moveBody(chain, "xs", "y"))).toContain('joint "arm"');
  });
});

describe("an empty target", () => {
  it("takes a new assembly's first body, since nothing moves it", () => {
    const { document: withSpare } = createAssembly(
      documentOf([], [body("a", "p")], [assembly("p", ABOUT_Z)]),
      "Spare",
    );
    expect(moveBody(withSpare, "a", "spare").document.bodies[0]?.assembly).toBe("spare");
  });
});
