import { describe, expect, it } from "vitest";
import {
  buildAsciiStl,
  buildBinaryStl,
  buildGlb,
  buildSampleGlb,
} from "../test-support/mesh-fixtures.ts";
import { extractGlbNodes } from "./glb.ts";
import { detectImportFormat } from "./import-body.ts";

describe("detectImportFormat", () => {
  it("recognises GLB, binary STL and ASCII STL by content", () => {
    expect(detectImportFormat(buildSampleGlb())).toBe("glb");
    expect(detectImportFormat(buildBinaryStl(0))).toBe("stl");
    expect(detectImportFormat(buildBinaryStl(3))).toBe("stl");
    expect(detectImportFormat(buildAsciiStl())).toBe("stl");
  });

  it("detects a binary STL whose header starts with solid as binary", () => {
    const bytes = buildBinaryStl(1);
    bytes.set(new TextEncoder().encode("solid exported by a CAD tool"));
    expect(detectImportFormat(bytes)).toBe("stl");
  });

  it.each(["ISO-10303-21;\nHEADER;", "\uFEFFISO-10303-21;\nHEADER;", "  \r\n\tISO-10303-21;"])(
    "recognises STEP %j by its ISO 10303-21 header",
    (text) => {
      expect(detectImportFormat(new TextEncoder().encode(text))).toBe("step");
    },
  );

  it.each(["HEADER;\nISO-10303-21;", "ISO-10303-21\n", "iso-10303-21;", "ISO-10303-28;"])(
    "does not take %j for STEP",
    (text) => {
      expect(detectImportFormat(new TextEncoder().encode(text))).toBeUndefined();
    },
  );

  it("rejects look-alikes", () => {
    const glbVersionOne = buildSampleGlb();
    glbVersionOne[4] = 1;
    const truncatedBinaryStl = buildBinaryStl(3).subarray(0, 150);
    const solidWithoutFacet = new TextEncoder().encode("solid nothing here\nendsolid");
    expect(detectImportFormat(glbVersionOne)).toBeUndefined();
    expect(detectImportFormat(truncatedBinaryStl)).toBeUndefined();
    expect(detectImportFormat(solidWithoutFacet)).toBeUndefined();
    expect(detectImportFormat(new Uint8Array())).toBeUndefined();
  });
});

describe("extractGlbNodes", () => {
  it("uses scene roots when the file has scenes", () => {
    const glb = buildGlb({
      scenes: [{ nodes: [1] }],
      nodes: [{ name: "not in scene" }, { name: "root", children: [2] }, { name: "child" }],
    });
    expect(extractGlbNodes(glb)).toEqual([
      { name: "root", path: [1] },
      { name: "child", path: [1, 2] },
    ]);
  });

  it("uses unparented nodes as roots when the file has no scene", () => {
    const glb = buildGlb({ nodes: [{ name: "child" }, { name: "root", children: [0] }] });
    expect(extractGlbNodes(glb)).toEqual([
      { name: "root", path: [1] },
      { name: "child", path: [1, 0] },
    ]);
  });

  it("returns no nodes for a file without nodes", () => {
    expect(extractGlbNodes(buildGlb({ asset: { version: "2.0" } }))).toEqual([]);
  });

  it.each([
    [
      "a cycle",
      {
        nodes: [
          { name: "a", children: [1] },
          { name: "b", children: [0] },
        ],
        scenes: [{ nodes: [0] }],
      },
    ],
    ["a missing child", { nodes: [{ name: "a", children: [4] }] }],
    ["non numeric children", { nodes: [{ name: "a", children: ["b"] }] }],
    ["a missing scene", { scene: 3, scenes: [{ nodes: [] }], nodes: [] }],
    ["a non object JSON", [1, 2]],
  ])("rejects %s", (_description, gltf) => {
    expect(() => extractGlbNodes(buildGlb(gltf))).toThrow(/GLB file is malformed/);
  });

  it("rejects shared children quickly instead of walking every path", () => {
    const nodeCount = 40;
    const nodes = Array.from({ length: nodeCount }, (_unused, index) => ({
      name: `n${index}`,
      children: index + 1 < nodeCount ? [index + 1, index + 1] : [],
    }));
    const startedAt = performance.now();
    expect(() => extractGlbNodes(buildGlb({ scenes: [{ nodes: [0] }], nodes }))).toThrow(
      /reached twice/,
    );
    expect(performance.now() - startedAt).toBeLessThan(100);
  });

  it("rejects a header length that does not match the file", () => {
    const glb = buildSampleGlb();
    new DataView(glb.buffer).setUint32(8, glb.byteLength + 4, true);
    expect(() => extractGlbNodes(glb)).toThrow(/header length/);
  });
});
