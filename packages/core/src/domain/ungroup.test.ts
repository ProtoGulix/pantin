import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  DISSOLVING_POSITIONS,
  dissolvingDocument,
  GROUPING_POSITIONS,
  groupingDocument,
} from "../test-support/group-fixtures.ts";
import { expectSamePoses } from "../test-support/placed-fixtures.ts";
import { groupBodies } from "./group-bodies.ts";
import { renamedTags } from "./tags.ts";
import { ungroup } from "./ungroup.ts";

// Dégrouper (ADR 0055 point 7), the cases that succeed. Refusals are in
// ungroup-refusals.test.ts.

function dissolved() {
  const before = dissolvingDocument();
  return { before, ...ungroup(before, "g") };
}

describe("ungroup, the structure", () => {
  it("removes the group and its holding joint, and lists the joint", () => {
    const { document, deletedJoints } = dissolved();
    expect(document.assemblies.map(({ key }) => key)).toEqual(["m", "x"]);
    expect(deletedJoints.map(({ id }) => id)).toEqual(["hold"]);
    expect(document.joints.map(({ id }) => id)).toEqual(["ring", "slide", "ex"]);
  });

  it("moves bodies, objects, drives and sub-assemblies to the parent assembly", () => {
    const { document } = dissolved();
    expect(new Set(document.bodies.map(({ assembly }) => assembly))).toEqual(new Set(["m", "x"]));
    expect(document.guides.map(({ assembly }) => assembly)).toEqual(["m", "m"]);
  });

  it("re-points the joints of the group to the parent assembly", () => {
    const { document } = dissolved();
    expect(document.joints.find(({ id }) => id === "ring")?.parent).toEqual(groupEndpoint("m"));
    expect(document.joints.find(({ id }) => id === "slide")?.parent).toEqual(bodyEndpoint("ga"));
  });

  it("reports the tags whose prefix changed", () => {
    const { document, before } = dissolved();
    expect(renamedTags(before, document)).toEqual([
      { from: "g.ring.setpoint", to: "m.ring.setpoint" },
      { from: "g.ring.position", to: "m.ring.position" },
      { from: "g.slide.setpoint", to: "m.slide.setpoint" },
      { from: "g.slide.position", to: "m.slide.position" },
    ]);
  });
});

describe("ungroup, poses", () => {
  it("changes no pose, at rest and away from it", () => {
    const { document, before } = dissolved();
    expectSamePoses(document, before, new Map());
    expectSamePoses(document, before, DISSOLVING_POSITIONS);
  });

  it("rewrites a pose written in the group's frame into the parent's frame", () => {
    const { document, before } = dissolved();
    const guideBefore = before.guides.find(({ id }) => id === "in-g");
    const guideAfter = document.guides.find(({ id }) => id === "in-g");
    expect(guideAfter?.placement).not.toEqual(guideBefore?.placement);
    expect(document.joints.find(({ id }) => id === "ring")?.origin).not.toEqual([0.1, 0.2, 0.3]);
  });

  it("dissolves a group that nothing moves into an assembly that nothing moves", () => {
    const before = dissolvingDocument();
    const free = { ...before, joints: before.joints.filter(({ id }) => id !== "hold") };
    const { document, deletedJoints } = ungroup(free, "g");
    expect(deletedJoints).toEqual([]);
    expectSamePoses(document, free, DISSOLVING_POSITIONS);
  });
});

describe("ungroup after groupBodies", () => {
  it("gives back the document, apart from the deleted fixed joints", () => {
    const before = groupingDocument();
    const request = { name: "G", bodies: ["a", "b"], assemblies: ["s"] };
    const { document: grouped, group } = groupBodies(before, "m", request);
    const { document: restored, deletedJoints } = ungroup(grouped, group.key);
    expect(deletedJoints.map(({ id }) => id)).toEqual(["g"]);
    // "sb" hung from the handle; it now hangs from the assembly, which the
    // handle follows: same frame, same pose.
    const expected = {
      ...before,
      joints: before.joints
        .filter(({ id }) => id !== "fa")
        .map((joint) => (joint.id === "sb" ? { ...joint, parent: groupEndpoint("m") } : joint)),
    };
    expect(restored).toEqual(expected);
    expectSamePoses(restored, before, GROUPING_POSITIONS);
  });
});
