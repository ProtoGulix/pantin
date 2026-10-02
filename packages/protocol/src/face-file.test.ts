import { describe, expect, it } from "vitest";
import { FaceFileSchema, faceFilePathOf } from "./face-file.ts";

const faceFile = {
  formatVersion: 1,
  writer: "cadquery-ocp-novtk 8.0.1.0.0",
  solid: true,
  primitives: [
    {
      mesh: 0,
      primitive: 0,
      ranges: [
        [0, 2, 0],
        [2, 4, 1],
        [6, 1, 2],
      ],
    },
  ],
  faces: [
    { kind: "plane", point: [0, 0, 0.02], normal: [0, 0, 1] },
    { kind: "cylinder", point: [0.02, 0.015, 0], direction: [0, 0, -1], radius: 0.005 },
    { kind: "other" },
  ],
};

describe("FaceFileSchema", () => {
  it("accepts the three face kinds and their ranges", () => {
    expect(FaceFileSchema.parse(faceFile)).toEqual(faceFile);
  });

  it("refuses a range that names a face the file does not have", () => {
    const result = FaceFileSchema.safeParse({
      ...faceFile,
      primitives: [{ mesh: 0, primitive: 0, ranges: [[0, 2, 3]] }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["primitives", 0, "ranges", 0, 2],
      message: "Face 3 does not exist: the file has 3 faces.",
    });
  });

  it.each([
    ["another format version", { ...faceFile, formatVersion: 2 }],
    [
      "an empty range",
      { ...faceFile, primitives: [{ mesh: 0, primitive: 0, ranges: [[0, 0, 0]] }] },
    ],
    [
      "a cylinder without radius",
      { ...faceFile, faces: [{ kind: "cylinder", point: [0, 0, 0], direction: [0, 0, 1] }] },
    ],
    ["an unknown face kind", { ...faceFile, faces: [{ kind: "cone" }] }],
    [
      "a point that is not three numbers",
      { ...faceFile, faces: [{ kind: "plane", point: [0, 0], normal: [0, 0, 1] }] },
    ],
  ])("refuses %s", (_case, candidate) => {
    expect(FaceFileSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("faceFilePathOf", () => {
  it("puts the face file next to a GLB mesh, and gives none for an STL mesh", () => {
    expect(faceFilePathOf("meshes/rail.glb")).toBe("meshes/rail.faces.json");
    expect(faceFilePathOf("meshes/rail.stl")).toBeUndefined();
  });
});
