import type { Joint, PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  clampJointPosition,
  computePoses,
  currentJointPosition,
  jointMotion,
} from "./kinematics.ts";
import { apply, type RigidTransform, type Vector3 } from "./rigid-transform.ts";

function body(id: string) {
  return {
    id,
    name: id,
    source: {
      fileName: `${id}.stl`,
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

function documentWith(joints: Joint[], bodyIds = ["base", "arm", "slider"]): PantinDocument {
  return { schema_version: 2, name: "Test", bodies: bodyIds.map(body), joints };
}

const prismatic: Joint = {
  id: "slide",
  type: "prismatic",
  name: "Slide",
  parent: "base",
  child: "arm",
  origin: [0, 0, 0],
  axis: [2, 0, 0],
  limits: [0, 0.8],
};

const revolute: Joint = {
  id: "hinge",
  type: "revolute",
  name: "Hinge",
  parent: "base",
  child: "arm",
  origin: [1, 0, 0],
  axis: [0, 0, 1],
  limits: [-Math.PI, Math.PI],
};

const continuous: Joint = {
  id: "spin",
  type: "continuous",
  name: "Spin",
  parent: "base",
  child: "arm",
  origin: [1, 0, 0],
  axis: [0, 0, 1],
};

const fixed: Joint = {
  id: "weld",
  type: "fixed",
  name: "Weld",
  parent: "base",
  child: "arm",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
};

function expectPoint(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

function poseMap(document: PantinDocument, positions: [string, number][]) {
  const poses = computePoses(document, new Map(positions));
  return new Map(
    poses.map((pose): [string, RigidTransform] => [
      pose.bodyId,
      { rotation: pose.rotation, translation: pose.translation },
    ]),
  );
}

function transformOf(poses: Map<string, RigidTransform>, bodyId: string): RigidTransform {
  const pose = poses.get(bodyId);
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}`);
  }
  return pose;
}

describe("clampJointPosition", () => {
  it.each<[Joint, number, number]>([
    [prismatic, 0.4, 0.4],
    [prismatic, 1, 0.8],
    [prismatic, -0.1, 0],
    [revolute, 4, Math.PI],
    [revolute, -4, -Math.PI],
    [continuous, 100, 100],
    [fixed, 5, 0],
  ])("%#: clamps to the joint limits", (joint, requested, expected) => {
    expect(clampJointPosition(joint, requested)).toBe(expected);
  });
});

describe("currentJointPosition", () => {
  it("clamps the default position when the limits exclude 0", () => {
    const raised: Joint = { ...prismatic, limits: [0.1, 0.2] };
    expect(currentJointPosition(raised, new Map())).toBe(0.1);
    const carriage = computePoses(documentWith([raised]), new Map()).find(
      (pose) => pose.bodyId === raised.child,
    );
    expectPoint(carriage?.translation ?? [0, 0, 0], [0.1, 0, 0]);
  });

  it("keeps a position already written", () => {
    expect(currentJointPosition(prismatic, new Map([["slide", 0.4]]))).toBe(0.4);
  });
});

describe("jointMotion", () => {
  it("translates a prismatic joint along its normalised axis", () => {
    const motion = jointMotion(prismatic, 0.4);
    expect(motion.rotation).toEqual([0, 0, 0, 1]);
    expectPoint(motion.translation, [0.4, 0, 0]);
  });

  it("rotates a revolute joint about the axis through its origin", () => {
    const motion = jointMotion(revolute, Math.PI / 2);
    expectPoint(apply(motion, [1, 0, 0]), [1, 0, 0]); // the origin does not move
    expectPoint(apply(motion, [2, 0, 0]), [1, 1, 0]);
    expectPoint(apply(motion, [1, 0, 5]), [1, 0, 5]); // a point on the axis
  });

  it("does not bound a continuous joint", () => {
    expectPoint(apply(jointMotion(continuous, 2 * Math.PI + Math.PI / 2), [2, 0, 0]), [1, 1, 0]);
  });

  it("is the identity for a fixed joint", () => {
    expect(jointMotion(fixed, 0)).toEqual({ rotation: [0, 0, 0, 1], translation: [0, 0, 0] });
  });

  it("normalises the axis of a rotation", () => {
    const scaled: Joint = { ...revolute, axis: [0, 0, 7] };
    expectPoint(apply(jointMotion(scaled, Math.PI / 2), [2, 0, 0]), [1, 1, 0]);
  });
});

describe("computePoses", () => {
  it("gives the identity to bodies without a parent joint", () => {
    const poses = computePoses(documentWith([prismatic]), new Map([["slide", 0.5]]));
    expect(poses.find((pose) => pose.bodyId === "base")).toEqual({
      bodyId: "base",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    expect(poses.map((pose) => pose.bodyId)).toEqual(["base", "arm", "slider"]);
  });

  it("uses position 0 when none is set", () => {
    const poses = poseMap(documentWith([prismatic]), []);
    expect(transformOf(poses, "arm").translation).toEqual([0, 0, 0]);
  });
});

describe("computePoses on chains", () => {
  it("composes a chain: a revolute joint then a prismatic joint on the moving body", () => {
    const slider: Joint = {
      ...prismatic,
      id: "slide",
      parent: "arm",
      child: "slider",
      axis: [1, 0, 0],
    };
    const document = documentWith([revolute, slider]);
    const poses = poseMap(document, [
      ["hinge", Math.PI / 2],
      ["slide", 0.5],
    ]);
    // A slider point at (2, 0, 0): slides to (2.5, 0, 0), then turns about (1, 0, 0).
    expectPoint(apply(transformOf(poses, "slider"), [2, 0, 0]), [1, 1.5, 0]);
    expectPoint(apply(transformOf(poses, "arm"), [2, 0, 0]), [1, 1, 0]);
  });

  it("orders parents before children whatever the joint order", () => {
    const slider: Joint = {
      ...prismatic,
      id: "slide",
      parent: "arm",
      child: "slider",
      axis: [1, 0, 0],
    };
    const positions: [string, number][] = [
      ["hinge", 0.3],
      ["slide", 0.2],
    ];
    const forward = computePoses(documentWith([revolute, slider]), new Map(positions));
    const backward = computePoses(documentWith([slider, revolute]), new Map(positions));
    expect(backward).toEqual(forward);
  });

  it("is deterministic", () => {
    const document = documentWith([revolute]);
    const first = computePoses(document, new Map([["hinge", 0.123456789]]));
    const second = computePoses(document, new Map([["hinge", 0.123456789]]));
    expect(second).toEqual(first);
  });
});
