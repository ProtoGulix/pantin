import type { PantinDocument } from "@pantin/protocol";
import { expect } from "vitest";
import { bodyPoseTransforms, framedWorldPose } from "../domain/framed-world-pose.ts";
import { computeDisplacements, computePoses } from "../domain/kinematics.ts";
import { computePosedAssemblyFrames } from "../domain/posed-assembly-frames.ts";
import type { RigidTransform } from "../domain/rigid-transform.ts";
import { expectPoint, expectSameRotation } from "./expect-point.ts";

// Checks that two documents place the same things in the world (ADR 0056):
// exact frames, not the rounded ones of the pose response.

function expectSameTransform(actual: RigidTransform, expected: RigidTransform): void {
  expectPoint(actual.translation, expected.translation);
  expectSameRotation(actual.rotation, expected.rotation);
}

function objectPoses(document: PantinDocument, positions: ReadonlyMap<string, number>) {
  const displacements = computeDisplacements(document, positions);
  const frames = computePosedAssemblyFrames(document, displacements);
  const bodies = bodyPoseTransforms(computePoses(document, positions, displacements));
  const objects = [
    ...document.belts,
    ...document.guides,
    ...document.emitters,
    ...document.absorbers,
    ...document.presenceSensors,
  ];
  return objects.map((item) => ({
    id: item.id,
    pose: framedWorldPose(item, frames, bodies),
  }));
}

export function expectSameObjectPoses(
  actual: PantinDocument,
  expected: PantinDocument,
  positions: ReadonlyMap<string, number>,
): void {
  const wanted = objectPoses(expected, positions);
  const poses = objectPoses(actual, positions);
  expect(poses.map(({ id }) => id)).toEqual(wanted.map(({ id }) => id));
  poses.forEach(({ pose }, index) => {
    const reference = wanted[index];
    expect(reference).toBeDefined();
    if (reference !== undefined) {
      expectSameTransform(pose, reference.pose);
    }
  });
}

// The posed frame of an assembly whose frame was turned is a new frame by
// design, so `except` leaves those out.
export function expectSamePosedFrames(
  actual: PantinDocument,
  expected: PantinDocument,
  positions: ReadonlyMap<string, number>,
  except: readonly string[],
): void {
  const frames = (document: PantinDocument) =>
    computePosedAssemblyFrames(document, computeDisplacements(document, positions));
  const wanted = frames(expected);
  for (const [key, frame] of frames(actual)) {
    if (!except.includes(key)) {
      const reference = wanted.get(key);
      expect(reference, `posed frame of "${key}"`).toBeDefined();
      if (reference !== undefined) {
        expectSameTransform(frame, reference);
      }
    }
  }
}
