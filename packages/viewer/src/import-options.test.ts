import { describe, expect, it } from "vitest";
import {
  buildImportQuery,
  createPendingImport,
  detectSourceFormat,
  pantinNameFromFile,
} from "./import-options.ts";

describe("import options", () => {
  it("names a Pantin after its file, without the last extension", () => {
    expect(pantinNameFromFile("3630 rail.step")).toBe("3630 rail");
    expect(pantinNameFromFile("robot.v2.glb")).toBe("robot.v2");
    expect(pantinNameFromFile("noextension")).toBe("noextension");
    expect(pantinNameFromFile("  .glb")).toBe("");
    expect(pantinNameFromFile(`${"a".repeat(250)}.stl`)).toBe("a".repeat(200));
  });

  it("detects the format from the extension, case insensitive", () => {
    expect(detectSourceFormat("rail.GLB")).toBe("glb");
    expect(detectSourceFormat("carriage.stl")).toBe("stl");
    expect(detectSourceFormat("assembly.STEP")).toBe("step");
    expect(detectSourceFormat("assembly.stp")).toBe("step");
    expect(detectSourceFormat("part.obj")).toBeNull();
    expect(detectSourceFormat("noextension")).toBeNull();
    expect(detectSourceFormat(".step")).toBeNull();
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

  it("defaults a STEP to Z up and never sends a unit: STEP declares its own", () => {
    const pendingImport = createPendingImport("assembly.step");
    expect(pendingImport).toMatchObject({ format: "step", upAxis: "z" });
    expect(pendingImport && buildImportQuery({ ...pendingImport, unit: "mm" })).toEqual({
      fileName: "assembly.step",
      upAxis: "z",
    });
  });

  it("refuses an unsupported file", () => {
    expect(createPendingImport("part.obj")).toBeNull();
  });
});
