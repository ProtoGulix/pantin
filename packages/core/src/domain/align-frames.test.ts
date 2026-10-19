import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectSameObjectPoses, expectSamePosedFrames } from "../test-support/align-checks.ts";
import { ALIGN_POSITIONS, alignDocument, RAILS_AXIS } from "../test-support/align-fixtures.ts";
import { expectPoint } from "../test-support/expect-point.ts";
import { expectSamePoses, joint } from "../test-support/placed-fixtures.ts";
import { alignFramesOnJoint, rotationFromZ } from "./align-frames.ts";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { rotate } from "./rigid-transform.ts";

// Align the frames on a joint axis (ADR 0056 points 1 and 2).

function aligned() {
  const before = alignDocument();
  return { before, ...alignFramesOnJoint(before, "slide") };
}

const find = <Item extends { id: string }>(items: readonly Item[], id: string) =>
  items.find((item) => item.id === id);

describe("alignFramesOnJoint, the frames", () => {
  it("makes the slider read exactly [0, 0, 1], and reframes the parent and the group", () => {
    const { document, reframedAssemblies } = aligned();
    expect(find(document.joints, "slide")?.axis).toEqual([0, 0, 1]);
    expect(reframedAssemblies).toEqual(["top", "g"]);
  });

  it("puts the posed Z of the group on the direction of the rails", () => {
    const { before, document } = aligned();
    const rails = rotate(
      computeWorldPlacements(before).get("top")?.rotation ?? [0, 0, 0, 1],
      RAILS_AXIS,
    );
    const worldOfGroup = computeWorldPlacements(document).get("g");
    expectPoint(rotate(worldOfGroup?.rotation ?? [0, 0, 0, 1], [0, 0, 1]), rails);
  });

  it("rewrites the joints read in the frames and lists them, the slider included", () => {
    const { before, document, rewrittenJoints } = aligned();
    expect(rewrittenJoints.map(({ id }) => id).sort()).toEqual([
      "extend",
      "hinge",
      "slide",
      "top-hinge",
    ]);
    expect(find(document.joints, "hinge")?.origin).not.toEqual(
      find(before.joints, "hinge")?.origin,
    );
  });

  it("keeps limits, sensors and the sensor on a body of the group", () => {
    const { before, document } = aligned();
    expect(find(document.joints, "slide")).toMatchObject({ limits: [0, 0.5], type: "prismatic" });
    expect(document.sensors).toEqual(before.sensors);
    expect(find(document.presenceSensors, "cell")).toEqual(find(before.presenceSensors, "cell"));
  });
});

describe("alignFramesOnJoint, what stays", () => {
  it("leaves untouched a joint and an assembly outside the two assemblies", () => {
    const { before, document } = aligned();
    expect(find(document.joints, "far-hinge")).toEqual(find(before.joints, "far-hinge"));
    for (const key of ["far", "idle"]) {
      const placementOf = (doc: typeof document) =>
        doc.assemblies.find((assembly) => assembly.key === key);
      expect(placementOf(document)).toEqual(placementOf(before));
    }
    expect(
      document.bodies.filter(({ assembly }) => assembly === "far" || assembly === "idle"),
    ).toEqual(before.bodies.filter(({ assembly }) => assembly === "far" || assembly === "idle"));
  });
});

describe("alignFramesOnJoint, anchored assemblies", () => {
  it("moves the placement of an assembly anchored to the group", () => {
    const { before, document } = aligned();
    const placementOf = (doc: typeof document) =>
      doc.assemblies.find(({ key }) => key === "sub")?.placement;
    expect(placementOf(document)).not.toEqual(placementOf(before));
  });
});

describe("alignFramesOnJoint, nothing moves", () => {
  it.each([
    ["at rest", new Map<string, number>()],
    ["with the slider away from 0", new Map([["slide", 0.3]])],
    ["with the pivot at 1 rad", new Map([["hinge", 1]])],
    ["with every joint moved", ALIGN_POSITIONS],
  ])("keeps every body pose, object pose and posed frame %s", (_label, positions) => {
    const { before, document, reframedAssemblies } = aligned();
    expectSamePoses(document, before, positions);
    expectSameObjectPoses(document, before, positions);
    expectSamePosedFrames(document, before, positions, reframedAssemblies);
  });
});

describe("alignFramesOnJoint, other cases", () => {
  it("reframes only the parent's assembly when the child is a body", () => {
    const before = alignDocument();
    const { reframedAssemblies, document } = alignFramesOnJoint(before, "hinge");
    expect(reframedAssemblies).toEqual(["g"]);
    expect(find(document.joints, "hinge")?.axis).toEqual([0, 0, 1]);
    expectSamePoses(document, before, ALIGN_POSITIONS);
  });

  it("changes nothing a second time", () => {
    const { document } = aligned();
    const again = alignFramesOnJoint(document, "slide");
    expect(again.reframedAssemblies).toEqual([]);
    expect(again.rewrittenJoints).toEqual([]);
    expect(again.document).toEqual(document);
  });

  it("turns half a turn about X for an axis opposite to Z", () => {
    const [x, y, z, w] = rotationFromZ([0, 0, -1]) ?? [];
    expect([x, y, z]).toEqual([1, 0, 0]);
    expect(w).toBeCloseTo(0, 12);
    expect(rotationFromZ([0, 0, 1])).toBeUndefined();
  });

  it("refuses a fixed joint and an unknown joint", () => {
    const document = alignDocument();
    const withFixed = {
      ...document,
      joints: [
        ...document.joints,
        joint({ id: "weld", type: "fixed", parent: bodyEndpoint("g1"), child: bodyEndpoint("g2") }),
      ],
    };
    expect(() => alignFramesOnJoint(withFixed, "weld")).toThrow(
      /fixed joint has no axis to align with/,
    );
    expect(() => alignFramesOnJoint(document, "ghost")).toThrow(/no joint "ghost"/);
  });
});
