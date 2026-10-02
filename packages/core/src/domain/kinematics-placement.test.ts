import {
  type Assembly,
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../test-support/expect-point.ts";
import { computeWorldPlacements, deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { jointMotion } from "./joint-types/registry.ts";
import { computePoses, currentJointPosition } from "./kinematics.ts";
import { apply, compose, IDENTITY_TRANSFORM, type RigidTransform } from "./rigid-transform.ts";

// Placements of assemblies and bodies in the pose (ADR 0033 points 3 to 5).

const IDENTITY: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const HALF_TURN_SINE = Math.SQRT1_2;
const QUARTER_ABOUT_X: Placement["rotation"] = [HALF_TURN_SINE, 0, 0, HALF_TURN_SINE];
const QUARTER_ABOUT_Z: Placement["rotation"] = [0, 0, HALF_TURN_SINE, HALF_TURN_SINE];

function assembly(key: string, placement: Placement = IDENTITY): Assembly {
  return { key, name: key, placement };
}

function body(id: string, assemblyKey: string, placement?: Placement): Body {
  const source: Body["source"] = {
    fileName: "a.stl",
    format: "stl",
    unit: "m",
    upAxis: "z",
    nodes: [],
  };
  const base = { id, name: id, assembly: assemblyKey, source, mesh: `meshes/${id}.stl` };
  return placement === undefined ? base : { ...base, placement };
}

function joint(fields: Partial<Joint> & Pick<Joint, "id" | "parent" | "child">): Joint {
  return {
    tagKey: fields.id,
    name: fields.id,
    type: "revolute",
    origin: [0, 0, 0],
    axis: [0, 0, 1],
    limits: [-Math.PI, Math.PI],
    ...fields,
    // Joint is a union keyed by `type`; spreading partial fields over a
    // revolute default cannot be narrowed by the compiler.
  } as Joint;
}

function documentOf(assemblies: Assembly[], bodies: Body[], joints: Joint[]): PantinDocument {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies,
    bodies,
    joints,
    drives: [],
    actuators: [],
    sensors: [],
  };
}

function poseOf(document: PantinDocument, positions: [string, number][], bodyId: string) {
  const pose = computePoses(document, new Map(positions)).find((item) => item.bodyId === bodyId);
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}`);
  }
  const transform: RigidTransform = { rotation: pose.rotation, translation: pose.translation };
  return transform;
}

// The computation as it was before ADR 0033, to prove nothing moves bit for bit.
function legacyPoses(document: PantinDocument, positions: ReadonlyMap<string, number>) {
  const parentJointOf = new Map(document.joints.map((item) => [item.child, item]));
  const poseOfBody = (id: string): RigidTransform => {
    const parentJoint = parentJointOf.get(id);
    return parentJoint === undefined
      ? IDENTITY_TRANSFORM
      : compose(
          poseOfBody(parentJoint.parent),
          jointMotion(parentJoint, currentJointPosition(parentJoint, positions)),
        );
  };
  return document.bodies.map((item) => {
    const { rotation, translation } = poseOfBody(item.id);
    return { bodyId: item.id, translation: [...translation], rotation: [...rotation] };
  });
}

describe("computePoses with identity placements", () => {
  it("equals the computation before placements, bit for bit", () => {
    const document = documentOf(
      [assembly("a"), assembly("b")],
      ["base", "arm", "slider", "screw"].map((id) => body(id, id === "screw" ? "b" : "a")),
      [
        joint({
          id: "hinge",
          parent: "base",
          child: "arm",
          origin: [1, 0.3, -0.2],
          axis: [1, 2, 3],
        }),
        joint({
          id: "slide",
          type: "prismatic",
          parent: "arm",
          child: "slider",
          axis: [0.3, -1, 0.2],
          limits: [-1, 1],
        }),
        joint({
          id: "thread",
          type: "helical",
          parent: "slider",
          child: "screw",
          origin: [0.1, 0.2, 0.3],
          axis: [0, 1, 1],
          limits: [-9, 9],
          pitch: 0.004,
        }),
      ],
    );
    const positions = new Map([
      ["hinge", 0.7],
      ["slide", -0.35],
      ["thread", 1.9],
    ]);
    expect(computePoses(document, positions)).toEqual(legacyPoses(document, positions));
  });
});

describe("computePoses with a placed assembly", () => {
  const placed = assembly("p", { translation: [0, 0, 5], rotation: QUARTER_ABOUT_X });
  // Anchored by the fixed joint "mount", which hangs from the moving arm of p.
  const anchored = assembly("q", { translation: [0, 0, 1], rotation: QUARTER_ABOUT_Z });
  const document = documentOf(
    [placed, anchored],
    [body("p0", "p"), body("p1", "p"), body("q0", "q"), body("q1", "q")],
    [
      joint({ id: "hinge", parent: "p0", child: "p1", origin: [1, 0, 0], axis: [0, 0, 1] }),
      joint({ id: "mount", type: "fixed", parent: "p1", child: "q0" }),
      joint({
        id: "slide",
        type: "prismatic",
        parent: "q0",
        child: "q1",
        axis: [1, 0, 0],
        limits: [0, 1],
      }),
    ],
  );

  it("turns a revolute joint about its moved axis", () => {
    // Local axis z becomes world -y; the pivot (1, 0, 0) becomes (1, 0, 5).
    // The point (2, 0, 0) of p1 starts at (2, 0, 5) and ends at (1, 0, 6).
    const pose = poseOf(document, [["hinge", Math.PI / 2]], "p1");
    expectPoint(apply(pose, [2, 0, 0]), [1, 0, 6]);
    expectPoint(apply(poseOf(document, [], "p1"), [2, 0, 0]), [2, 0, 5]);
  });

  it("derives each anchor with the joint that anchors it, none for the world", () => {
    const anchors = deriveAssemblyAnchors(document);
    expect([...anchors.keys()]).toEqual(["q"]);
    expect(anchors.get("q")).toMatchObject({ assembly: "p", joint: { id: "mount" } });
  });

  it("composes the placement of an assembly with those of its anchors", () => {
    const worlds = computeWorldPlacements(document);
    expectPoint(worlds.get("q")?.translation ?? [9, 9, 9], [0, -1, 5]);
  });

  it("moves anchored assemblies, their bodies and their joint axes, with the anchor", () => {
    const moved = documentOf(
      [{ ...placed, placement: { ...placed.placement, translation: [0, 0, 15] } }, anchored],
      document.bodies,
      document.joints,
    );
    expectPoint(apply(poseOf(moved, [], "q0"), [0, 0, 0]), [0, -1, 15]);
    // Local x of q is world z: sliding by 0.5 lifts q1 by 0.5, 10 m higher.
    expectPoint(apply(poseOf(moved, [["slide", 0.5]], "q1"), [0, 0, 0]), [0, -1, 15.5]);
    expectPoint(apply(poseOf(document, [["slide", 0.5]], "q1"), [0, 0, 0]), [0, -1, 5.5]);
  });

  it("carries the anchored assembly along the motion of the joint that anchors it", () => {
    // q0 starts at (0, -1, 5); p1 turns by 90 degrees about the world axis -y
    // through (1, 0, 5), which takes the point to (1, -1, 4).
    const pose = poseOf(document, [["hinge", Math.PI / 2]], "q0");
    expectPoint(apply(pose, [0, 0, 0]), [1, -1, 4]);
  });
});

describe("computePoses with a body placement", () => {
  it("offsets the pose of the body inside its assembly", () => {
    const document = documentOf(
      [assembly("a", { translation: [1, 0, 0], rotation: [0, 0, 0, 1] })],
      [
        body("fixed", "a"),
        body("offset", "a", { translation: [0, 0.1, 0], rotation: [0, 0, 0, 1] }),
      ],
      [],
    );
    expectPoint(poseOf(document, [], "fixed").translation, [1, 0, 0]);
    expectPoint(poseOf(document, [], "offset").translation, [1, 0.1, 0]);
  });
});
