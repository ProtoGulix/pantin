import type { PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { documentOf, joint } from "../test-support/placed-fixtures.ts";
import { setAssemblyPlacement } from "./assembly-edits.ts";
import { placementGivingPose } from "./keep-displayed-pose.ts";
import { computePoses } from "./kinematics.ts";
import { axisAngleRotation, compose, type RigidTransform, toPlacement } from "./rigid-transform.ts";

// The placement that gives one body of an assembly a wanted displayed pose
// (ADR 0033 point 6, ADR 0035 point 10), for any body of the assembly: also
// one displaced by a joint inside it, anchored or not.

const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: "frame",
  child: "carriage",
  axis: [1, 0, 0],
  limits: [0, 1],
});
const MOUNT = joint({ id: "mount", type: "fixed", parent: "carriage", child: "clevis" });
// Inside the "chape" assembly: the rod turns on the clevis.
const ROD_TURN = joint({ id: "rod-turn", parent: "clevis", child: "rod", origin: [0.2, 0, 0.1] });

const POSITIONS = new Map([
  ["slide", 0.3],
  ["rod-turn", 0.7],
]);

// A quarter turn about a tilted axis, then a shift: a motion that does not
// commute with the rod's own turn.
const MOTION: RigidTransform = {
  rotation: axisAngleRotation([0.3, -0.5, 1], Math.PI / 2),
  translation: [0.05, -0.02, 0.1],
};

function poseIn(document: PantinDocument, bodyId: string): RigidTransform {
  const pose = computePoses(document, POSITIONS).find((candidate) => candidate.bodyId === bodyId);
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}.`);
  }
  return pose;
}

describe.each([
  ["anchored to a displaced carriage", [SLIDE, MOUNT, ROD_TURN]],
  ["anchored to the world", [SLIDE, ROD_TURN]],
])("placementGivingPose, assembly %s", (_case, joints) => {
  it("gives a body displaced by a joint inside the assembly exactly the wanted pose", () => {
    const document = documentOf(joints);
    const rod = document.bodies.find((candidate) => candidate.id === "rod");
    if (rod === undefined) {
      throw new Error("The fixture has a rod.");
    }
    const wanted = compose(MOTION, poseIn(document, "rod"));
    const placement = placementGivingPose(document, "chape", rod, wanted, POSITIONS);
    const placed = setAssemblyPlacement(document, "chape", toPlacement(placement));
    const pose = poseIn(placed, "rod");
    pose.translation.forEach((value, index) => {
      expect(value).toBeCloseTo(wanted.translation[index] ?? Number.NaN, 12);
    });
    const sign = Math.sign(pose.rotation[3] * wanted.rotation[3]) || 1;
    pose.rotation.forEach((value, index) => {
      expect(value * sign).toBeCloseTo(wanted.rotation[index] ?? Number.NaN, 12);
    });
  });
});
