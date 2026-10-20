import { describe, expect, it } from "vitest";
import { axisAngleRotation, type RigidTransform } from "../domain/rigid-transform.ts";
import { beltBodyPose, beltBodyVelocities, toSinglePrecision } from "./belt-motion.ts";

const OFF_ORIGIN: RigidTransform = {
  translation: [1.23, -2.35, 0.79],
  rotation: axisAngleRotation([0.3, -0.5, 0.8], 0.3),
};

describe("beltBodyVelocities", () => {
  it("gives a belt that stays where it is exactly no frame velocity", () => {
    // What Rapier reads back after the body was put at the frame's pose.
    const previous = toSinglePrecision(beltBodyPose(OFF_ORIGIN));
    const { linear, angular } = beltBodyVelocities(previous, {
      id: "b",
      pose: OFF_ORIGIN,
      surfaceVelocity: [0, 0, 0],
    });
    expect(linear).toEqual([0, 0, 0]);
    expect(angular).toEqual([0, 0, 0]);
  });

  it("adds the surface velocity to the frame velocity", () => {
    const previous = toSinglePrecision(beltBodyPose(OFF_ORIGIN));
    const { linear } = beltBodyVelocities(previous, {
      id: "b",
      pose: OFF_ORIGIN,
      surfaceVelocity: [0.5, 0, 0],
    });
    expect(linear).toEqual([0.5, 0, 0]);
  });
});
