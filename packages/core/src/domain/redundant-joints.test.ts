import {
  bodyEndpoint,
  groupEndpoint,
  type JointEndpoint,
  type PantinDocument,
} from "@pantin/protocol";
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
import { deleteRedundantFixedJoints, findRedundantFixedJoints } from "./redundant-joints.ts";

// Which fixed joints a group makes redundant (ADR 0060 points 2, 3 and 7).
// "m" is not moved by any joint (an assembly that is not a group); its handle
// "h" has a star of fixed joints (non-identity origin, placed bodies), a chain
// and a slider with a fixed joint under it. "g" is a group held to "h" by a
// slider; "x" and "y" are groups held by fixed joints between assemblies.

const fixed = (id: string, parent: string, child: string) =>
  joint({ id, type: "fixed", parent: bodyEndpoint(parent), child: bodyEndpoint(child) });

const SLIDE_X: {
  type: "prismatic";
  axis: [number, number, number];
  limits: [number, number];
} = { type: "prismatic", axis: [1, 0, 0], limits: [0, 1] };

const group = (id: string, parent: JointEndpoint, child: JointEndpoint) =>
  joint({ id, type: "fixed", parent, child });

function machineJoints() {
  return [
    fixed("star-a", "h", "a"),
    fixed("star-b", "h", "b"),
    fixed("chain", "a", "c"),
    joint({ id: "slide", ...SLIDE_X, parent: bodyEndpoint("h"), child: bodyEndpoint("e") }),
    fixed("under-slide", "e", "f"),
    fixed("deeper", "f", "i"),
    joint({ id: "hold-g", ...SLIDE_X, parent: bodyEndpoint("h"), child: groupEndpoint("g") }),
    group("group-first", groupEndpoint("g"), bodyEndpoint("g1")),
    fixed("group-second", "g1", "g2"),
    group("hold-x", bodyEndpoint("h"), groupEndpoint("x")),
    group("x-to-y", groupEndpoint("x"), groupEndpoint("y")),
    joint({ id: "ring", parent: bodyEndpoint("g2"), child: bodyEndpoint("g3") }),
  ];
}

const machineBodies = () => [
  body("h", "m"),
  body("a", "m", ABOUT_X),
  body("b", "m", ABOUT_DIAGONAL),
  body("c", "m", ABOUT_Z),
  body("e", "m"),
  body("f", "m", ABOUT_X),
  body("i", "m"),
  body("g1", "g", ABOUT_Z),
  body("g2", "g", ABOUT_DIAGONAL),
  body("g3", "g"),
  body("x1", "x"),
  body("y1", "y"),
];

const machineAssemblies = () => [
  assembly("m", ABOUT_Z),
  { ...assembly("g", ABOUT_X), parent: "m" },
  assembly("x", ABOUT_DIAGONAL),
  assembly("y", ABOUT_X),
];

function machine(extra: Partial<PantinDocument> = {}): PantinDocument {
  return documentOf(machineJoints(), machineBodies(), machineAssemblies(), extra);
}

const ids = (list: { id: string }[]) => list.map(({ id }) => id);
const MOVED = new Map([
  ["slide", 0.3],
  ["hold-g", 0.2],
  ["ring", 0.5],
]);

describe("findRedundantFixedJoints", () => {
  it("lists the star, the chain and the joints under a group, sorted", () => {
    const { redundant } = findRedundantFixedJoints(machine());
    expect(ids(redundant)).toEqual(["group-first", "group-second", "chain", "star-a", "star-b"]);
    expect(redundant[0]?.assembly).toEqual({ key: "g", name: "g" });
  });

  it("keeps a fixed joint under a slider, naming the nearest moving joint", () => {
    const { kept } = findRedundantFixedJoints(machine());
    expect(kept.map(({ id, reason, by }) => [id, reason, by.id])).toEqual([
      ["deeper", "moving_parent", "slide"],
      ["under-slide", "moving_parent", "slide"],
    ]);
    expect(kept[0]?.by).toEqual({ kind: "joint", id: "slide", name: "slide" });
  });

  it("never lists a fixed joint between two assemblies", () => {
    const listed = findRedundantFixedJoints(machine());
    const everyId = [...ids(listed.redundant), ...ids(listed.kept)];
    expect(everyId).not.toContain("hold-x");
    expect(everyId).not.toContain("x-to-y");
  });

  it("sorts the same whatever the order of the joints", () => {
    const document = machine();
    const shuffled = { ...document, joints: [...document.joints].reverse() };
    expect(findRedundantFixedJoints(shuffled)).toEqual(findRedundantFixedJoints(document));
  });

  it("keeps a joint that something relies on, as a guard", () => {
    // An actuator on a fixed joint is refused by the protocol: the document is
    // built by hand, so the cast to the actuator type is the test's own.
    const actuators = [
      { id: "push", name: "Push", joints: ["star-a"] },
    ] as unknown as PantinDocument["actuators"];
    const { redundant, kept } = findRedundantFixedJoints(machine({ actuators }));
    expect(ids(redundant)).not.toContain("star-a");
    expect(kept.find(({ id }) => id === "star-a")).toMatchObject({
      reason: "in_use",
      by: { kind: "actuator", id: "push", name: "Push" },
    });
  });
});

describe("deleteRedundantFixedJoints", () => {
  it("deletes the whole redundant set without moving any body", () => {
    const before = machine();
    const everyRedundant = ids(findRedundantFixedJoints(before).redundant);
    const result = deleteRedundantFixedJoints(before, everyRedundant);
    expect(ids(result.deletedJoints).sort()).toEqual([...everyRedundant].sort());
    expect(result.skipped).toEqual([]);
    expect(ids(findRedundantFixedJoints(result.document).redundant)).toEqual([]);
    expectSamePoses(result.document, before, new Map());
    expectSamePoses(result.document, before, MOVED);
  });

  it("deletes any subset without moving any body", () => {
    const before = machine();
    const { document } = deleteRedundantFixedJoints(before, ["chain", "group-second"]);
    expect(ids(document.joints)).not.toContain("chain");
    expect(ids(document.joints)).toContain("star-a");
    expectSamePoses(document, before, MOVED);
  });

  it("skips what is not redundant or not there, and deletes nothing else", () => {
    const before = machine();
    const result = deleteRedundantFixedJoints(before, ["star-a", "under-slide", "hold-x", "nope"]);
    expect(ids(result.deletedJoints)).toEqual(["star-a"]);
    expect(result.skipped).toEqual(["under-slide", "hold-x", "nope"]);
    expect(result.document.joints).toHaveLength(before.joints.length - 1);
  });

  it("does not delete a joint that something relies on", () => {
    const actuators = [
      { id: "push", name: "Push", joints: ["star-a"] },
    ] as unknown as PantinDocument["actuators"];
    const result = deleteRedundantFixedJoints(machine({ actuators }), ["star-a"]);
    expect(result.deletedJoints).toEqual([]);
    expect(result.skipped).toEqual(["star-a"]);
  });
});
