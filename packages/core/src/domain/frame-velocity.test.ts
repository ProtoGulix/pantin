import { describe, expect, it } from "vitest";
import { frameVelocity } from "./frame-velocity.ts";
import { axisAngleRotation, IDENTITY_TRANSFORM, type RigidTransform } from "./rigid-transform.ts";

const STEP = 1 / 120;

const turnedAbout = (angle: number): RigidTransform => ({
  ...IDENTITY_TRANSFORM,
  rotation: axisAngleRotation([0, 0, 1], angle),
});

describe("frameVelocity", () => {
  it("is nil for a frame that does not move", () => {
    expect(frameVelocity(IDENTITY_TRANSFORM, IDENTITY_TRANSFORM, STEP)).toEqual({
      linear: [0, 0, 0],
      angular: [0, 0, 0],
    });
  });

  it("gives the displacement over the step as linear velocity", () => {
    const moved: RigidTransform = { ...IDENTITY_TRANSFORM, translation: [0.01, 0, -0.02] };
    const { linear, angular } = frameVelocity(IDENTITY_TRANSFORM, moved, STEP);
    expect(linear[0]).toBeCloseTo(1.2, 9);
    expect(linear[2]).toBeCloseTo(-2.4, 9);
    expect(angular).toEqual([0, 0, 0]);
  });

  it("gives the world axis and rate of a turn as angular velocity", () => {
    const { angular } = frameVelocity(IDENTITY_TRANSFORM, turnedAbout(0.012), STEP);
    expect(angular[0]).toBeCloseTo(0, 12);
    expect(angular[2]).toBeCloseTo(1.44, 9);
  });

  it("turns the short way round when the quaternion sign flips", () => {
    const { angular } = frameVelocity(turnedAbout(3.1), turnedAbout(3.2 - 2 * Math.PI), STEP);
    expect(angular[2]).toBeCloseTo(0.1 / STEP, 6);
  });
});
