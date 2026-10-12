import { describe, expect, it } from "vitest";
import { bodyPoseTransforms, framedWorldPose } from "./framed-world-pose.ts";
import { axisAngleRotation, IDENTITY_TRANSFORM, type RigidTransform } from "./rigid-transform.ts";

const quarterTurnZ = axisAngleRotation([0, 0, 1], Math.PI / 2);
const assemblyWorlds = new Map<string, RigidTransform>([
  ["a", { rotation: quarterTurnZ, translation: [1, 0, 0] }],
]);
const bodyPoses = bodyPoseTransforms([
  { bodyId: "arm", rotation: [0, 0, 0, 1], translation: [0, 5, 2] },
]);
const placement: RigidTransform = { rotation: [0, 0, 0, 1], translation: [0.5, 0, 0] };

function near(actual: readonly number[], expected: readonly number[]): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, 12);
  }
}

describe("framedWorldPose", () => {
  it("places relative to the assembly frame without a body", () => {
    const pose = framedWorldPose({ assembly: "a", placement }, assemblyWorlds, bodyPoses);
    // The assembly turns +X into +Y, then sits at x = 1.
    near(pose.translation, [1, 0.5, 0]);
    near(pose.rotation, quarterTurnZ);
  });

  it("places relative to the posed body frame with a body", () => {
    const pose = framedWorldPose(
      { assembly: "a", body: "arm", placement },
      assemblyWorlds,
      bodyPoses,
    );
    near(pose.translation, [0.5, 5, 2]);
    near(pose.rotation, [0, 0, 0, 1]);
  });

  it("follows the body when it moves", () => {
    const moved = bodyPoseTransforms([
      { bodyId: "arm", rotation: [...quarterTurnZ], translation: [0, 0, 0] },
    ]);
    const pose = framedWorldPose({ assembly: "a", body: "arm", placement }, assemblyWorlds, moved);
    near(pose.translation, [0, 0.5, 0]);
  });

  it("returns the frame itself for an identity placement", () => {
    const pose = framedWorldPose(
      { assembly: "a", placement: IDENTITY_TRANSFORM },
      assemblyWorlds,
      bodyPoses,
    );
    expect(pose).toBe(assemblyWorlds.get("a"));
  });

  it("falls back to the world frame for an unknown assembly", () => {
    expect(framedWorldPose({ assembly: "x", placement }, assemblyWorlds, bodyPoses)).toEqual(
      placement,
    );
  });
});
