import type { FaceFile } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { faceAtTriangle, primitiveOfPointers } from "./face-lookup.ts";

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
        [2, 6, 1],
      ],
    },
    { mesh: 0, primitive: 1, ranges: [[0, 4, 2]] },
  ],
  faces: [
    { kind: "plane", point: [0, 0, 0], normal: [0, 0, 1] },
    { kind: "cylinder", point: [0, 0, 0], direction: [0, 0, 1], radius: 0.005 },
    { kind: "other" },
  ],
};

describe("primitiveOfPointers", () => {
  it("reads the primitive pointer the glTF loader records", () => {
    expect(primitiveOfPointers(["/nodes/2", "/meshes/0/primitives/1"])).toEqual({
      mesh: 0,
      primitive: 1,
    });
    expect(primitiveOfPointers(["/nodes/2"])).toBeNull();
  });
});

describe("faceAtTriangle", () => {
  it("gives the face whose range holds the triangle, with the whole range", () => {
    expect(faceAtTriangle(FACE_FILE, { mesh: 0, primitive: 0 }, 5)).toEqual({
      face: 1,
      firstTriangle: 2,
      triangleCount: 6,
    });
    expect(faceAtTriangle(FACE_FILE, { mesh: 0, primitive: 1 }, 0)?.face).toBe(2);
  });

  it("gives nothing past the ranges or for an unknown primitive", () => {
    expect(faceAtTriangle(FACE_FILE, { mesh: 0, primitive: 0 }, 8)).toBeNull();
    expect(faceAtTriangle(FACE_FILE, { mesh: 1, primitive: 0 }, 0)).toBeNull();
  });
});
