import { JOINT_COORDINATE_UNITS, type Joint, JointSchema, type JointType } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { apply, IDENTITY_TRANSFORM, type Vector3 } from "../rigid-transform.ts";
import { clampJointPosition, isMovableJoint, jointMotion } from "./registry.ts";

// Invariants every joint type must keep (ADR 0013 point 4). A new type only
// adds its example here; the compiler asks for it.

const shared: Pick<Joint, "name" | "parent" | "child" | "origin" | "axis"> = {
  name: "Example",
  parent: "base",
  child: "arm",
  origin: [0.1, -0.2, 0.3],
  axis: [0, 0, 2],
};

const EXAMPLES: { readonly [Type in JointType]: Extract<Joint, { type: Type }> } = {
  fixed: { id: "fixed", tagKey: "fixed", type: "fixed", ...shared },
  prismatic: {
    id: "prismatic",
    tagKey: "prismatic",
    type: "prismatic",
    ...shared,
    limits: [-0.1, 0.4],
  },
  revolute: { id: "revolute", tagKey: "revolute", type: "revolute", ...shared, limits: [-1, 2] },
  continuous: { id: "continuous", tagKey: "continuous", type: "continuous", ...shared },
  helical: {
    id: "helical",
    tagKey: "helical",
    type: "helical",
    ...shared,
    limits: [-0.02, 0.3],
    pitch: -0.005,
  },
};

const SAMPLE_COORDINATES = [-7, -0.3, 0, 0.05, 1.2, 25];

const ORIGIN_POINT: Vector3 = [0, 0, 0];
const UNIT_POINT: Vector3 = [1, 0, 0];
const FAR_POINT: Vector3 = [0.3, -2, 0.7];
const SAMPLE_POINTS = [ORIGIN_POINT, UNIT_POINT, FAR_POINT];

function distance([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

describe.each(Object.values(EXAMPLES))("joint type $type", (joint) => {
  it("is accepted by the protocol schema", () => {
    expect(JointSchema.parse(joint)).toEqual(joint);
  });

  it("does not move at coordinate 0", () => {
    const motion = jointMotion(joint, 0);
    for (const point of SAMPLE_POINTS) {
      apply(motion, point).forEach((value, index) => {
        expect(value).toBeCloseTo(point[index] ?? Number.NaN, 12);
      });
    }
  });

  it.each(SAMPLE_COORDINATES)("moves rigidly at coordinate %d", (coordinate) => {
    const motion = jointMotion(joint, coordinate);
    expect(Math.hypot(...motion.rotation)).toBeCloseTo(1, 12);
    const moved = (point: Vector3) => apply(motion, point);
    expect(distance(moved(ORIGIN_POINT), moved(UNIT_POINT))).toBeCloseTo(
      distance(ORIGIN_POINT, UNIT_POINT),
      12,
    );
    expect(distance(moved(UNIT_POINT), moved(FAR_POINT))).toBeCloseTo(
      distance(UNIT_POINT, FAR_POINT),
      12,
    );
  });

  it.each(SAMPLE_COORDINATES)("clamps %d idempotently, inside the limits", (coordinate) => {
    const clamped = clampJointPosition(joint, coordinate);
    expect(clampJointPosition(joint, clamped)).toBe(clamped);
    if ("limits" in joint) {
      expect(clamped).toBeGreaterThanOrEqual(joint.limits[0]);
      expect(clamped).toBeLessThanOrEqual(joint.limits[1]);
    }
  });

  it("never moves when it has no coordinate", () => {
    if (JOINT_COORDINATE_UNITS[joint.type] === null) {
      expect(isMovableJoint(joint)).toBe(false);
      for (const coordinate of SAMPLE_COORDINATES) {
        expect(clampJointPosition(joint, coordinate)).toBe(0);
        expect(jointMotion(joint, coordinate)).toEqual(IDENTITY_TRANSFORM);
      }
    }
  });
});
