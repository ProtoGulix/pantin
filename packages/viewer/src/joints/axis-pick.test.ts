import type { FaceFile } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { slideJoint, weldJoint } from "../test-fixtures.ts";
import { initialViewerState } from "../viewer-state.ts";
import { axisPickRequestOf, canPickAxis, withAxisAnswer } from "./axis-pick.ts";
import { jointFormFor } from "./joint-edit-form.ts";
import { initialJointForm, withJointFormType } from "./joint-form.ts";

const click: ViewportPick = {
  bodyId: "rod",
  meshIndex: 0,
  pointers: ["/meshes/0/primitives/0"],
  triangle: 5,
  point: [0.1, 0.2, 0.3],
  normal: [0, 0, 1],
};

const faceFile: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [{ mesh: 0, primitive: 0, ranges: [[4, 3, 7]] }],
  faces: [],
};

describe("axisPickRequestOf", () => {
  it("names the face of the face file under the click, and tints all of it", () => {
    expect(axisPickRequestOf(click, faceFile)).toMatchObject({
      ok: true,
      request: { bodyId: "rod", faceIndex: 7, hitPoint: [0.1, 0.2, 0.3] },
      highlight: { firstTriangle: 4, triangleCount: 3 },
    });
  });

  it("refuses a triangle the face file does not map", () => {
    expect(axisPickRequestOf({ ...click, triangle: 99 }, faceFile)).toEqual({
      ok: false,
      refusal: "unmappedFace",
    });
  });

  it("still asks without a face file, so the core says why it refuses", () => {
    expect(axisPickRequestOf(click, null)).toMatchObject({ ok: true, request: { faceIndex: 0 } });
  });
});

describe("canPickAxis", () => {
  it("needs a stored joint that moves", () => {
    expect(canPickAxis(jointFormFor(slideJoint))).toBe(true);
    expect(canPickAxis(jointFormFor(weldJoint))).toBe(false);
    expect(canPickAxis(initialJointForm([]))).toBe(false);
    // The user's path: a stored fixed joint whose type is changed to a slider.
    expect(canPickAxis(withJointFormType(jointFormFor(weldJoint), "prismatic"))).toBe(true);
    expect(canPickAxis(null)).toBe(false);
  });
});

describe("withAxisAnswer", () => {
  it("shows the origin in millimetres and the axis as given", () => {
    const form = withAxisAnswer(jointFormFor(slideJoint), {
      origin: [0.0125, 0, -0.02],
      axis: [-1, 0, 0],
    });
    expect(form.values).toMatchObject({
      "origin.x": "12.5",
      "origin.y": "0",
      "origin.z": "-20",
      "axis.x": "-1",
      "axis.y": "0",
      "axis.z": "0",
    });
  });
});

describe("initial state", () => {
  it("has no axis pick", () => {
    expect(initialViewerState("fr").axisPick).toBeNull();
  });
});
