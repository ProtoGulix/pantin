import { bodyEndpoint, type Joint, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  importDocument,
  MACHINE,
  MACHINE_LOCATIONS,
  NO_LOCATIONS,
  part,
  QUARTER_TURN,
  SUB_LOCATION,
} from "../test-support/import-pipeline.ts";
import type { AssemblyLocation } from "./assembly-frames.ts";
import { computePoses } from "./kinematics.ts";

function poseOf(document: PantinDocument, bodyId: string, positions = new Map<string, number>()) {
  const pose = computePoses(document, positions).find((candidate) => candidate.bodyId === bodyId);
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}`);
  }
  return pose;
}

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, at) => {
    expect(actual[at] ?? Number.NaN).toBeCloseTo(value, 9);
  });
}

describe("planImportFrames", () => {
  it("sets nothing when there are no locations", () => {
    const { document } = importDocument(MACHINE, NO_LOCATIONS);
    expect(document.assemblies.map(({ placement }) => placement)).toEqual([
      { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ]);
    expect(document.bodies.every((body) => body.placement === undefined)).toBe(true);
  });

  it("keeps every mesh where the CAD puts it", () => {
    const placed = importDocument(MACHINE, MACHINE_LOCATIONS).document;
    const flat = importDocument(MACHINE, NO_LOCATIONS).document;
    for (const body of flat.bodies) {
      const [expected, actual] = [poseOf(flat, body.id), poseOf(placed, body.id)];
      expectClose(actual.translation, expected.translation);
      expectClose(actual.rotation, expected.rotation);
    }
  });

  it("gives a sub-assembly its location relative to its anchor", () => {
    const { document } = importDocument(MACHINE, MACHINE_LOCATIONS);
    const [machine, sub] = document.assemblies;
    // M sits at [0.5, 0, 0] in the world; Sub is anchored to M through plate.
    expect(machine?.placement.translation).toEqual([0.5, 0, 0]);
    expect(sub?.placement.translation).toEqual(SUB_LOCATION.translation);
    expectClose(sub?.placement.rotation ?? [], [...QUARTER_TURN]);
    const bodyOfSub = document.bodies.find((body) => body.id === "b1");
    expectClose(bodyOfSub?.placement?.rotation ?? [], [0, 0, -QUARTER_TURN[2], QUARTER_TURN[3]]);
  });
});

describe("planImportFrames anchors and joints", () => {
  it("anchors to the assembly of the parent body when the STEP parent has no body", () => {
    // R holds only A and B: the handle of R is a1, so B hangs from A, not R.
    const components = [part("R@0", "A@0.0", "a1@0.0.0"), part("R@0", "B@0.1", "b1@0.1.0")];
    const locations: AssemblyLocation[] = [
      { path: [0], translation: [0, 0, 1], rotation: [0, 0, 0, 1] },
      { path: [0, 0], translation: [1, 0, 0], rotation: [...QUARTER_TURN] },
      { path: [0, 1], translation: [0, 3, 0], rotation: [0, 0, 0, 1] },
    ];
    const { document } = importDocument(components, locations);
    const [root, a, b] = document.assemblies;
    // A has no incoming joint between assemblies: world frame, R then A.
    expectClose(a?.placement.translation ?? [], [1, 0, 1]);
    // B = W(A)⁻¹ ∘ W(B): [-1, 3, 0] seen from A turned a quarter turn.
    expectClose(b?.placement.translation ?? [], [3, 1, 0]);
    expectClose(root?.placement.translation ?? [], [0, 0, 1]);
    for (const body of document.bodies) {
      expectClose(poseOf(document, body.id).translation, [0, 0, 0]);
    }
  });

  it("moves a prismatic joint along the world Y in a sub-assembly turned about Z", () => {
    const { document } = importDocument(MACHINE, MACHINE_LOCATIONS);
    // b2 slides along the X of its own assembly, which is turned about Z: the
    // axis reads in the frame of the parent body's assembly (ADR 0033 point 3).
    const slide: Joint = {
      id: "slide",
      tagKey: "slide",
      type: "prismatic",
      name: "Slide",
      parent: bodyEndpoint("b1"),
      child: bodyEndpoint("b2"),
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 1],
    };
    const moved = { ...document, joints: [...document.joints, slide] };
    const pose = poseOf(moved, "b2", new Map([[slide.id, 0.5]]));
    expectClose(pose.translation, [0, 0.5, 0]);
    expectClose(pose.rotation, [0, 0, 0, 1]);
  });
});
