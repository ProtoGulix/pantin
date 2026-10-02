import type { FaceFile } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { newAlignmentSession, withKind, withPick } from "./alignment-session.ts";
import { resolveAlignmentPick, type ViewportPick } from "./pick-resolution.ts";

// "block" moves; "frame" (assembly "a") is a target; "hanger" hangs from the
// block, so it moves with it and cannot be a target.
const DOCUMENT = documentOf({
  assemblies: ["a", "block", "hanger"],
  bodies: [bodyOf("block", "block"), bodyOf("hanger", "hanger")],
  joints: [{ ...jointOf("hang", "hanger", "fixed"), parent: "block" }],
});

const FACE_FILE: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [
    {
      mesh: 0,
      primitive: 0,
      ranges: [
        [0, 2, 0],
        [2, 8, 1],
      ],
    },
  ],
  faces: [
    { kind: "plane", point: [0, 0, 0], normal: [0, 0, 1] },
    { kind: "cylinder", point: [0, 0, 0], direction: [0, 0, 1], radius: 0.005 },
  ],
};

function click(bodyId: string, triangle: number): ViewportPick {
  return {
    bodyId,
    meshIndex: 0,
    pointers: ["/meshes/0/primitives/0"],
    triangle,
    point: [0.1, 0.2, 0.3],
    normal: [0, 0, 1],
  };
}

const planeSession = newAlignmentSession("bench", "block");

describe("resolveAlignmentPick", () => {
  it("takes a face of the face file for the next pick and tints the whole face", () => {
    const outcome = resolveAlignmentPick(DOCUMENT, planeSession, click("block", 1), FACE_FILE);
    expect(outcome).toEqual({
      ok: true,
      index: 0,
      state: {
        pick: { kind: "face", body: "block", face: 0, point: [0.1, 0.2, 0.3] },
        faceKind: "plane",
        highlight: {
          bodyId: "block",
          meshIndex: 0,
          firstTriangle: 0,
          triangleCount: 2,
          side: "moving",
        },
      },
    });
  });

  it("falls back to the triangle's plane on a body without face file", () => {
    const outcome = resolveAlignmentPick(DOCUMENT, planeSession, click("block", 5), null);
    expect(outcome).toMatchObject({
      ok: true,
      state: {
        pick: { kind: "plane", body: "block", normal: [0, 0, 1] },
        faceKind: "fallback",
        highlight: { firstTriangle: 5, triangleCount: 1 },
      },
    });
  });
});

describe("resolveAlignmentPick refusals", () => {
  it("refuses a target on the moving assembly or on what hangs from it", () => {
    const first = resolveAlignmentPick(DOCUMENT, planeSession, click("block", 0), FACE_FILE);
    if (!first.ok) {
      throw new Error("The first pick is valid.");
    }
    const second = withPick(planeSession, first.index, first.state);
    for (const bodyId of ["block", "hanger"]) {
      expect(resolveAlignmentPick(DOCUMENT, second, click(bodyId, 0), FACE_FILE)).toEqual({
        ok: false,
        refusal: "mustBeTarget",
      });
    }
    expect(resolveAlignmentPick(DOCUMENT, second, click("frame", 0), FACE_FILE).ok).toBe(true);
  });

  it("refuses a moving pick off the moving assembly", () => {
    expect(resolveAlignmentPick(DOCUMENT, planeSession, click("frame", 0), FACE_FILE)).toEqual({
      ok: false,
      refusal: "mustBeMoving",
    });
  });

  it("needs a cylinder face for an axis, which no fallback can give", () => {
    const axisSession = withKind(planeSession, "axis_on_axis");
    expect(resolveAlignmentPick(DOCUMENT, axisSession, click("block", 0), FACE_FILE)).toEqual({
      ok: false,
      refusal: "needsCylinder",
    });
    expect(resolveAlignmentPick(DOCUMENT, axisSession, click("block", 0), null)).toEqual({
      ok: false,
      refusal: "noFaceFile",
    });
    expect(resolveAlignmentPick(DOCUMENT, axisSession, click("block", 4), FACE_FILE).ok).toBe(true);
  });

  it("says when the clicked triangle is in no face of the face file", () => {
    const axisSession = withKind(planeSession, "axis_on_axis");
    expect(resolveAlignmentPick(DOCUMENT, axisSession, click("block", 40), FACE_FILE)).toEqual({
      ok: false,
      refusal: "unmappedFace",
    });
  });

  it("needs a plane face for a plane pick", () => {
    expect(resolveAlignmentPick(DOCUMENT, planeSession, click("block", 4), FACE_FILE)).toEqual({
      ok: false,
      refusal: "needsPlane",
    });
  });
});
