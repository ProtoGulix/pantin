import { type Joint, PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../test-support/expect-point.ts";
import { computePoses, currentJointPosition } from "./kinematics.ts";
import { apply, type RigidTransform } from "./rigid-transform.ts";

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "main",
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
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: [{ key: "main", name: "main" }],
    bodies: bodyIds.map(body),
    joints,
    drives: [],
    actuators: [],
    sensors: [],
  };
}

const prismatic: Joint = {
  id: "slide",
  tagKey: "slide",
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
  tagKey: "hinge",
  type: "revolute",
  name: "Hinge",
  parent: "base",
  child: "arm",
  origin: [1, 0, 0],
  axis: [0, 0, 1],
  limits: [-Math.PI, Math.PI],
};

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
