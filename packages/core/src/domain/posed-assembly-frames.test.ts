import type { Placement } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint } from "../test-support/expect-point.ts";
import { assembly, body, documentOf, joint } from "../test-support/placed-fixtures.ts";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { computeDisplacements, computePoses } from "./kinematics.ts";
import { computePosedAssemblyFrames } from "./posed-assembly-frames.ts";
import { compose, inverse, type RigidTransform, unitTransform } from "./rigid-transform.ts";

// The posed frame of an assembly (ADR 0043 point 1): W moved by the joints
// that anchor it. A chain: "base" at the world, "lift" anchored to it by a
// prismatic along the base X, "tool" anchored to the lift by a prismatic along
// the lift Y. The base is turned 90 degrees about Z, so a wrong frame shows.

const QUARTER = Math.SQRT1_2;
const BASE: Placement = { translation: [1, 0, 0], rotation: [0, 0, QUARTER, QUARTER] };
const IDENTITY_ROTATION: Placement["rotation"] = [0, 0, 0, 1];
const TOOL_BODY: Placement = { translation: [0.3, -0.2, 0.1], rotation: [QUARTER, 0, 0, QUARTER] };

function chain() {
  return documentOf(
    [
      joint({
        id: "lift",
        type: "prismatic",
        parent: "base",
        child: "lift",
        origin: [0, 0, 0],
        axis: [1, 0, 0],
        limits: [-1, 1],
      }),
      joint({
        id: "slide",
        type: "prismatic",
        parent: "lift",
        child: "tool",
        origin: [0, 0, 0],
        axis: [0, 1, 0],
        limits: [-1, 1],
      }),
    ],
    [body("base", "base"), body("lift", "lift"), body("tool", "tool", TOOL_BODY)],
    [
      assembly("base", BASE),
      assembly("lift", { translation: [0, 2, 0], rotation: IDENTITY_ROTATION }),
      assembly("tool", { translation: [0, 0, 3], rotation: IDENTITY_ROTATION }),
    ],
  );
}

function frames(positions: [string, number][]) {
  const document = chain();
  const map = new Map(positions);
  return {
    document,
    map,
    frames: computePosedAssemblyFrames(document, computeDisplacements(document, map)),
  };
}

function frameOf(posed: ReadonlyMap<string, RigidTransform>, key: string): RigidTransform {
  const frame = posed.get(key);
  if (frame === undefined) {
    throw new Error(`No frame for ${key}`);
  }
  return frame;
}

function expectSameRotation(actual: RigidTransform, expected: RigidTransform): void {
  actual.rotation.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.rotation[index] ?? Number.NaN, 12);
  });
}

describe("computePosedAssemblyFrames", () => {
  it("is the static frame at the reference configuration, to rounding", () => {
    const { document, frames: posed } = frames([]);
    for (const [key, world] of computeWorldPlacements(document)) {
      // The anchored frames carry the rounding of W · I · W⁻¹, about 1e-16.
      expectPoint(frameOf(posed, key).translation, world.translation);
      expectSameRotation(frameOf(posed, key), world);
    }
  });

  it("moves a chain of two anchored assemblies with the joints that anchor them", () => {
    const { frames: posed } = frames([
      ["lift", 0.5],
      ["slide", 0.2],
    ]);
    expect(frameOf(posed, "base").translation).toEqual([1, 0, 0]);
    // Prismatic axes are read in the frame of the parent body's assembly: the
    // base X is the world Y, the lift Y is the world -X.
    expectPoint(frameOf(posed, "lift").translation, [-1, 0.5, 0]);
    expectPoint(frameOf(posed, "tool").translation, [-1.2, 0.5, 3]);
    expectSameRotation(frameOf(posed, "tool"), frameOf(posed, "base"));
  });

  it("agrees with pose(body) composed with the inverse body placement of the anchor child", () => {
    const {
      document,
      map,
      frames: posed,
    } = frames([
      ["lift", -0.4],
      ["slide", 0.7],
    ]);
    const pose = computePoses(document, map).find((candidate) => candidate.bodyId === "tool");
    if (pose === undefined) {
      throw new Error("No pose for tool");
    }
    const fromPose = compose(
      { rotation: pose.rotation, translation: pose.translation },
      inverse(unitTransform(TOOL_BODY)),
    );
    expectPoint(frameOf(posed, "tool").translation, fromPose.translation);
    expectSameRotation(frameOf(posed, "tool"), fromPose);
  });
});
