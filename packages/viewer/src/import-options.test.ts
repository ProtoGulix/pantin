import { describe, expect, it } from "vitest";
import { buildImportQuery, createPendingImport, detectMeshFormat } from "./import-options.ts";

describe("import options", () => {
  it("detects the format from the extension, case insensitive", () => {
    expect(detectMeshFormat("rail.GLB")).toBe("glb");
    expect(detectMeshFormat("carriage.stl")).toBe("stl");
    expect(detectMeshFormat("part.step")).toBeNull();
    expect(detectMeshFormat("noextension")).toBeNull();
  });

  it("defaults a GLB to Y up and sends no unit", () => {
    const pendingImport = createPendingImport("rail.glb");
    expect(pendingImport).toMatchObject({ format: "glb", upAxis: "y" });
    expect(pendingImport && buildImportQuery(pendingImport)).toEqual({
      fileName: "rail.glb",
      upAxis: "y",
    });
  });

  it("defaults an STL to Z up in millimetres and sends the unit", () => {
    const pendingImport = createPendingImport("carriage.stl");
    expect(pendingImport).toMatchObject({ format: "stl", upAxis: "z", unit: "mm" });
    expect(pendingImport && buildImportQuery({ ...pendingImport, unit: "in" })).toEqual({
      fileName: "carriage.stl",
      unit: "in",
      upAxis: "z",
    });
  });

  it("refuses an unsupported file", () => {
    expect(createPendingImport("part.step")).toBeNull();
  });
});
