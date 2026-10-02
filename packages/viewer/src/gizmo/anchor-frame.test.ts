import { describe, expect, it } from "vitest";
import { composeTransforms, IDENTITY_TRANSFORM, type RigidTransform } from "../rigid-transform.ts";
import {
  anchorFrameOf,
  type GizmoTarget,
  gizmoNodeFrame,
  gizmoTargetOf,
  placementOfGizmoNode,
} from "./anchor-frame.ts";

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 9);
  });
}

function aboutZ(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360;
  return [0, 0, Math.sin(half), Math.cos(half)];
}

const turned = (degrees: number, translation: [number, number, number] = [0, 0, 0]) =>
  ({ translation, rotation: aboutZ(degrees) }) satisfies RigidTransform;

// Assembly A placed in the world, X anchored to A by a revolute joint turned
// by 90 degrees about Z at the world origin. The stream carries, for the
// joint's child body c, D . W(A) . p . B(c), with D the joint displacement.
const worldOfA = turned(10, [1, 0, 0]);
const placement = turned(20, [0.5, 0.25, 0]);
const bodyPlacement = turned(-15, [0.01, 0.02, 0.03]);
const displacement = turned(90);
const poseOfC = composeTransforms(
  displacement,
  composeTransforms(worldOfA, composeTransforms(placement, bodyPlacement)),
);
const target: GizmoTarget = {
  assemblyKey: "x",
  placement,
  anchoring: { bodyId: "c", bodyPlacement },
};
const poseOf = (bodyId: string) => (bodyId === "c" ? poseOfC : undefined);

describe("anchorFrameOf", () => {
  it("is the identity for an assembly anchored to the world", () => {
    const target: GizmoTarget = {
      assemblyKey: "a",
      placement: turned(30, [1, 2, 3]),
      anchoring: null,
    };
    expect(anchorFrameOf(target, () => undefined)).toBe(IDENTITY_TRANSFORM);
  });

  it("waits for the pose of the anchoring body", () => {
    const target: GizmoTarget = {
      assemblyKey: "x",
      placement: IDENTITY_TRANSFORM,
      anchoring: { bodyId: "c", bodyPlacement: undefined },
    };
    expect(anchorFrameOf(target, () => undefined)).toBeNull();
  });

  it("finds the anchor's displayed frame, joint motion included", () => {
    const frame = anchorFrameOf(target, poseOf);
    const expected = composeTransforms(displacement, worldOfA);
    expectClose(frame?.translation ?? [], expected.translation);
    expectClose(frame?.rotation ?? [], expected.rotation);
  });
});

describe("the gizmo's node", () => {
  it("puts the gizmo on the assembly's displayed frame with the anchor's axes", () => {
    const frame = anchorFrameOf(target, poseOf);
    if (frame === null) {
      throw new Error("the frame is known");
    }
    const node = gizmoNodeFrame(frame, placement);
    const displayed = composeTransforms(frame, placement);
    expectClose(node.translation, displayed.translation);
    expectClose(node.rotation, frame.rotation);
  });
});

describe("a gizmo released under a turned revolute body", () => {
  const frame = anchorFrameOf(target, poseOf) ?? IDENTITY_TRANSFORM;
  const start = gizmoNodeFrame(frame, placement);

  it("maps a drag along the anchor's X axis to a placement shift along X", () => {
    // Ten centimetres along the anchor's X axis, which the joint turned 100 degrees from the world's.
    const alongAnchorX = composeTransforms(frame, {
      translation: [0.1, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    const moved: RigidTransform = {
      translation: [
        start.translation[0] + alongAnchorX.translation[0] - frame.translation[0],
        start.translation[1] + alongAnchorX.translation[1] - frame.translation[1],
        start.translation[2] + alongAnchorX.translation[2] - frame.translation[2],
      ],
      rotation: start.rotation,
    };
    const result = placementOfGizmoNode(frame, placement, moved);
    expectClose(result.translation, [0.6, 0.25, 0]);
    expectClose(result.rotation, placement.rotation);
  });

  it("maps a turn about the anchor's Z axis to a premultiplied rotation", () => {
    const turnedNode: RigidTransform = {
      translation: start.translation,
      rotation: composeTransforms(
        { translation: [0, 0, 0], rotation: frame.rotation },
        { translation: [0, 0, 0], rotation: aboutZ(30) },
      ).rotation,
    };
    const result = placementOfGizmoNode(frame, placement, turnedNode);
    expectClose(result.rotation, aboutZ(50));
    expectClose(result.translation, placement.translation);
  });

  it("gives back the placement for a node that was not touched", () => {
    const result = placementOfGizmoNode(frame, placement, start);
    expectClose(result.translation, placement.translation);
    expectClose(result.rotation, placement.rotation);
  });
});

describe("gizmoTargetOf", () => {
  const rigid = (translation: [number, number, number]) => ({
    translation,
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  });
  const document = {
    assemblies: [
      { key: "a", name: "A", placement: rigid([0, 0, 0]) },
      { key: "x", name: "X", placement: rigid([1, 0, 0]) },
    ],
    bodies: [
      { id: "pa", assembly: "a" },
      { id: "cx", assembly: "x", placement: rigid([0, 0, 0.1]) },
    ],
    joints: [{ parent: "pa", child: "cx" }],
  };

  // Cast: the fixture holds only the fields the lookup reads.
  const asDocument = (partial: typeof document) =>
    partial as unknown as Parameters<typeof gizmoTargetOf>[0];

  it("names the body that anchors the assembly and its placement", () => {
    const target = gizmoTargetOf(asDocument(document), "x");
    expect(target?.anchoring).toEqual({ bodyId: "cx", bodyPlacement: rigid([0, 0, 0.1]) });
    expect(target?.placement).toEqual(rigid([1, 0, 0]));
  });

  it("anchors to the world when no joint links the assembly to another", () => {
    const target = gizmoTargetOf(asDocument(document), "a");
    expect(target?.anchoring).toBeNull();
  });

  it("is null for an unknown assembly", () => {
    expect(gizmoTargetOf(asDocument(document), "zz")).toBeNull();
  });
});
