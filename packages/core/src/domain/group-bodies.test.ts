import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { GROUPING_POSITIONS, groupingDocument } from "../test-support/group-fixtures.ts";
import { expectSamePoses, joint } from "../test-support/placed-fixtures.ts";
import { groupBodies } from "./group-bodies.ts";
import { renamedTags } from "./tags.ts";

// Grouper (ADR 0055 point 6), the cases that succeed. Refusals are in
// group-bodies-refusals.test.ts.

const GROUP = { name: "Nouvel assemblage", bodies: ["a", "b"], assemblies: ["s"] };
const KEY = "nouvel-assemblage";

function grouped(request = GROUP) {
  const before = groupingDocument();
  return { before, ...groupBodies(before, "m", request) };
}

describe("groupBodies, the group", () => {
  it("is a child of the assembly, at its frame, held by one fixed joint", () => {
    const { document, group } = grouped();
    expect(group).toEqual({
      key: KEY,
      name: "Nouvel assemblage",
      parent: "m",
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    });
    expect(document.assemblies.map(({ key }) => key)).toEqual(["m", KEY, "s", "x"]);
    expect(document.joints.at(-1)).toMatchObject({
      type: "fixed",
      parent: groupEndpoint("m"),
      child: groupEndpoint(KEY),
    });
  });

  it("takes the bodies and sub-assemblies, keeps their placement, and leaves the others", () => {
    const { document, before } = grouped();
    const assemblyOf = (id: string) => document.bodies.find((body) => body.id === id)?.assembly;
    expect(["h", "a", "b", "c"].map(assemblyOf)).toEqual(["m", KEY, KEY, "m"]);
    expect(document.assemblies.find(({ key }) => key === "s")?.parent).toBe(KEY);
    expect(document.bodies.find(({ id }) => id === "a")?.placement).toEqual(
      before.bodies.find(({ id }) => id === "a")?.placement,
    );
  });

  it("gives the holding joint an id that no deleted joint had", () => {
    const before = groupingDocument();
    const named = before.joints.map((item) => (item.id === "fa" ? { ...item, id: "rod" } : item));
    const { document, deletedJoints } = groupBodies({ ...before, joints: named }, "m", {
      name: "Rod",
      bodies: ["a"],
      assemblies: [],
    });
    expect(deletedJoints.map(({ id }) => id)).toEqual(["rod"]);
    expect(document.joints.at(-1)?.id).toBe("rod-2");
  });

  it("takes sub-assemblies alone", () => {
    const { document, deletedJoints } = grouped({ name: "Only s", bodies: [], assemblies: ["s"] });
    expect(deletedJoints).toEqual([]);
    expect(document.assemblies.find(({ key }) => key === "s")?.parent).toBe("only-s");
  });

  it("gets a free key when the name is taken", () => {
    const second = groupBodies(grouped().document, "m", {
      name: "Nouvel assemblage",
      bodies: ["c"],
      assemblies: [],
    });
    expect(second.group.key).toBe("nouvel-assemblage-2");
  });
});

describe("groupBodies, the joints", () => {
  it("deletes the fixed joint from a rigid non-member and lists it", () => {
    const { document, deletedJoints } = grouped();
    expect(deletedJoints.map(({ id }) => id)).toEqual(["fa"]);
    expect(document.joints.map(({ id }) => id)).not.toContain("fa");
  });

  it("re-points a moving joint from a rigid non-member to the group, numbers unchanged", () => {
    const { document, before } = grouped();
    const original = before.joints.find(({ id }) => id === "sb");
    const moved = document.joints.find(({ id }) => id === "sb");
    expect(moved).toEqual({ ...original, parent: groupEndpoint(KEY) });
  });

  it("keeps the joints to groups elsewhere", () => {
    const { document, before } = grouped();
    for (const id of ["ss", "bx"]) {
      expect(document.joints.find((item) => item.id === id)).toEqual(
        before.joints.find((item) => item.id === id),
      );
    }
  });

  it("keeps a joint between two members", () => {
    const before = groupingDocument();
    const inner = joint({ id: "k", parent: bodyEndpoint("a"), child: bodyEndpoint("c") });
    const withInner = {
      ...before,
      joints: [...before.joints, inner],
    };
    const { document } = groupBodies(withInner, "m", { ...GROUP, bodies: ["a", "c"] });
    expect(document.joints.find(({ id }) => id === "k")).toEqual(inner);
  });
});

describe("groupBodies, what stays the same", () => {
  it("changes no pose, at rest and away from it", () => {
    const { document, before } = grouped();
    expectSamePoses(document, before, new Map());
    expectSamePoses(document, before, GROUPING_POSITIONS);
  });

  it("reports the tags whose prefix changed with the bodies", () => {
    const { document, before } = grouped();
    expect(renamedTags(before, document)).toEqual([
      { from: "m.sb.setpoint", to: `${KEY}.sb.setpoint` },
      { from: "m.sb.position", to: `${KEY}.sb.position` },
    ]);
  });

  it("moves the objects attached to a member body, not the others", () => {
    const { document } = grouped();
    expect(document.guides.map(({ id, assembly }) => [id, assembly])).toEqual([
      ["on-a", KEY],
      ["free", "m"],
    ]);
  });
});
