import { describe, expect, it } from "vitest";
import { meshFormatFromPath } from "./mesh-format.ts";

describe("meshFormatFromPath", () => {
  it("picks the loader from the mesh file extension, case insensitive", () => {
    expect(meshFormatFromPath("meshes/rail.glb")).toBe("glb");
    expect(meshFormatFromPath("meshes/carriage.STL")).toBe("stl");
  });

  it("reads a STEP-derived body as GLB, whatever its source format", () => {
    expect(meshFormatFromPath("meshes/3630.00.0800N_0.glb")).toBe("glb");
  });

  it.each(["meshes/part.step", "meshes/noextension", "meshes/.glb", "meshes/model.gltf"])(
    "refuses %s",
    (path) => {
      expect(meshFormatFromPath(path)).toBeNull();
    },
  );
});
