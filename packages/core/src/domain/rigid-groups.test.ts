import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../test-support/expect-point.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  joint,
} from "../test-support/placed-fixtures.ts";
import { computeWorldPlacements, deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { moveBody } from "./assembly-edits.ts";
import { computeDisplacements, computePoses, endpointDisplacement } from "./kinematics.ts";
import { computePosedAssemblyFrames } from "./posed-assembly-frames.ts";
import {
  apply,
  compose,
  type RigidTransform,
  rotate,
  unitTransform,
  type Vector3,
} from "./rigid-transform.ts";
import { tagEntries } from "./tag-entries.ts";

// A group is one rigid piece (ADR 0055 point 2): D(group) = D(parent) . M(q),
// and a body with no parent joint follows its group.
//
// "p" holds p0 and p1. A slider moves the group "x" from p0 along X. The group
// holds xa and xc, which no joint moves, and xb, a ring that turns about the
// group itself. "z" is a group nothing moves.

const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: bodyEndpoint("p0"),
  child: groupEndpoint("x"),
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 1],
});
const RING = joint({
  id: "ring",
  type: "revolute",
  parent: groupEndpoint("x"),
  child: bodyEndpoint("xb"),
  origin: [0.1, 0, 0],
  axis: [0, 0, 1],
  limits: [-3, 3],
});

const document = () =>
  documentOf(
    [SLIDE, RING],
    [
      body("p0", "p"),
      body("p1", "p", ABOUT_X),
      body("xa", "x", ABOUT_DIAGONAL),
      body("xb", "x"),
      body("xc", "x", ABOUT_Z),
      body("za", "z"),
    ],
    [assembly("p", ABOUT_Z), assembly("x", ABOUT_X), assembly("z", ABOUT_DIAGONAL)],
  );

// A motion at 0 composes with the identity: equal up to rounding, not bit for bit.
function expectSameTransform(actual: RigidTransform, expected: RigidTransform): void {
  for (const [value, wanted] of [
    ...actual.translation.map((component, at) => [component, expected.translation[at]] as const),
    ...actual.rotation.map((component, at) => [component, expected.rotation[at]] as const),
  ]) {
    expect(value).toBeCloseTo(wanted ?? Number.NaN, 9);
  }
}

const POSITIONS = new Map([
  ["slide", 0.3],
  ["ring", 0.5],
]);

describe("the displacement of a group", () => {
  it("is the motion of its parent joint, in the frame of the parent's assembly", () => {
    const displacements = computeDisplacements(document(), POSITIONS);
    const group = endpointDisplacement(displacements, groupEndpoint("x"));
    // 0.3 m along X of the frame of "p", which is turned about Z.
    expectPoint(group.translation, [...rotate(unitTransform(ABOUT_Z).rotation, [0.3, 0, 0])]);
  });

  it("is the identity for a group no joint moves", () => {
    const displacements = computeDisplacements(document(), POSITIONS);
    expect(endpointDisplacement(displacements, groupEndpoint("p")).translation).toEqual([0, 0, 0]);
    expect(endpointDisplacement(displacements, groupEndpoint("z")).translation).toEqual([0, 0, 0]);
  });
});

describe("a body with no parent joint", () => {
  it("follows its group, exactly (ADR 0055 point 2)", () => {
    const displacements = computeDisplacements(document(), POSITIONS);
    const group = endpointDisplacement(displacements, groupEndpoint("x"));
    expect(endpointDisplacement(displacements, bodyEndpoint("xa"))).toEqual(group);
    expect(endpointDisplacement(displacements, bodyEndpoint("xc"))).toEqual(group);
  });

  it("stays at rest in a group nothing moves, and in the world-anchored one", () => {
    const displacements = computeDisplacements(document(), POSITIONS);
    for (const id of ["za", "p0", "p1"]) {
      expect(endpointDisplacement(displacements, bodyEndpoint(id))).toEqual({
        rotation: [0, 0, 0, 1],
        translation: [0, 0, 0],
      });
    }
  });

  it("follows the group along the whole chain of anchors", () => {
    // z hangs from the body xa of x: it moves with the slider as well.
    const chained = {
      ...document(),
      joints: [
        SLIDE,
        RING,
        joint({
          id: "to-z",
          type: "fixed",
          parent: bodyEndpoint("xa"),
          child: groupEndpoint("z"),
        }),
      ],
    };
    const displacements = computeDisplacements(chained, POSITIONS);
    const group = endpointDisplacement(displacements, groupEndpoint("x"));
    expectSameTransform(endpointDisplacement(displacements, bodyEndpoint("za")), group);
  });
});

describe("a body whose parent is the group itself", () => {
  it("turns about the joint in the frame of the group, carried by the group", () => {
    const displacements = computeDisplacements(document(), POSITIONS);
    const group = endpointDisplacement(displacements, groupEndpoint("x"));
    const ring = endpointDisplacement(displacements, bodyEndpoint("xb"));
    const atRest = computeDisplacements(document(), new Map([["slide", 0.3]]));
    // Without the ring angle the ring is where the group is.
    expectSameTransform(endpointDisplacement(atRest, bodyEndpoint("xb")), group);
    // With it, the ring moved relative to the group, not the other bodies.
    expect(ring).not.toEqual(group);
    expect(endpointDisplacement(displacements, bodyEndpoint("xa"))).toEqual(group);
    const worlds = computeWorldPlacements(document());
    const frame = worlds.get("x");
    expect(frame).toBeDefined();
    // The joint origin (0.1, 0, 0) of the group frame is a fixed point of the ring turn.
    const origin = apply(compose(group, frame ?? group), [0.1, 0, 0]);
    expectPoint(apply(compose(ring, frame ?? ring), [0.1, 0, 0]), [...origin]);
  });
});

describe("anchors and posed frames of groups", () => {
  it("anchors the group the joint moves, to the assembly of the parent", () => {
    const anchors = deriveAssemblyAnchors(document());
    expect([...anchors].map(([key, anchor]) => [key, anchor.assembly, anchor.joint.id])).toEqual([
      ["x", "p", "slide"],
    ]);
  });

  it("poses the frame of the group as D(group) . W(group)", () => {
    const value = document();
    const displacements = computeDisplacements(value, POSITIONS);
    const frames = computePosedAssemblyFrames(value, displacements);
    const group = endpointDisplacement(displacements, groupEndpoint("x"));
    const world = computeWorldPlacements(value).get("x");
    expect(frames.get("x")).toEqual(compose(group, world ?? group));
    // A group nothing moves keeps the very same transform as W.
    expect(frames.get("z")).toEqual(computeWorldPlacements(value).get("z"));
  });
});

describe("tag prefixes", () => {
  it("name a group child by its own key and a body child by the key of its assembly", () => {
    const names = tagEntries(document()).map((entry) => entry.name);
    expect(names).toEqual([
      "x.slide.setpoint",
      "x.slide.position",
      "x.ring.setpoint",
      "x.ring.position",
    ]);
  });
});

describe("moving a body with no parent joint to another group", () => {
  const translationOf = (value: ReturnType<typeof document>, q: number): Vector3 => {
    const pose = computePoses(value, new Map([["slide", q]])).find((item) => item.bodyId === "xa");
    return [
      pose?.translation[0] ?? Number.NaN,
      pose?.translation[1] ?? Number.NaN,
      pose?.translation[2] ?? Number.NaN,
    ];
  };

  // Current behaviour, until ADR 0055 point 11 (edits, slice 3) defines it: the
  // body keeps its world placement at rest, then follows its NEW group.
  it("keeps its pose at rest and takes the displacement of the new group", () => {
    const before = document();
    const after = moveBody(before, "xa", "z");
    expectPoint(translationOf(after, 0), translationOf(before, 0));
    // It followed the slider in x; in z, which nothing moves, it stays.
    expect(translationOf(before, 0.3)).not.toEqual(translationOf(before, 0));
    expectPoint(translationOf(after, 0.3), translationOf(after, 0));
  });
});
