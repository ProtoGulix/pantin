import { describe, expect, it } from "vitest";
import { findOrphanMeshFiles, keptMeshFileNames } from "./orphan-meshes.ts";

// Which files of the meshes folder are orphans (ADR 0038 point 1).

const file = (fileName: string, sizeInBytes = 10) => ({ fileName, sizeInBytes });

describe("findOrphanMeshFiles", () => {
  it("lists unused .glb, .stl and lone .faces.json files, sorted, with the total size", () => {
    const list = findOrphanMeshFiles(
      [file("b.stl", 5), file("c.faces.json", 7), file("a.glb", 100)],
      [],
    );
    expect(list.files.map(({ fileName }) => fileName)).toEqual(["a.glb", "b.stl", "c.faces.json"]);
    expect(list.files[0]).toEqual({ fileName: "a.glb", sizeInBytes: 100 });
    expect(list.totalSizeInBytes).toBe(112);
  });

  it("keeps a used GLB and its face file, and lists the face file of an orphan GLB", () => {
    const files = [file("a.glb"), file("a.faces.json"), file("b.glb"), file("b.faces.json")];
    const list = findOrphanMeshFiles(files, ["meshes/a.glb"]);
    expect(list.files.map(({ fileName }) => fileName)).toEqual(["b.faces.json", "b.glb"]);
  });

  it("never lists notes, .blend files or .DS_Store", () => {
    const files = [file("notes.txt"), file("part.blend"), file(".DS_Store"), file("faces.json")];
    expect(findOrphanMeshFiles(files, [])).toEqual({ files: [], totalSizeInBytes: 0 });
  });

  it.each([
    ["./meshes/Rail.GLB"],
    ["meshes\\rail.glb"],
    ["meshes//rail.glb"],
    ["meshes/sub/../rail.glb"],
    ["Meshes/rail.glb"],
    ["./meshes/../meshes/rail.glb"],
    ["../axis/meshes/rail.glb"],
    ["/home/user/pantins/axis/meshes/rail.glb"],
  ])("keeps rail.glb and its face file when a body path is %s", (meshPath) => {
    const files = [file("rail.glb"), file("rail.faces.json"), file("other.glb")];
    const list = findOrphanMeshFiles(files, [meshPath]);
    expect(list.files.map(({ fileName }) => fileName)).toEqual(["other.glb"]);
  });

  it("matches the extension ignoring case", () => {
    expect(findOrphanMeshFiles([file("A.GLB"), file("B.Stl")], []).files).toHaveLength(2);
  });
});

describe("keptMeshFileNames", () => {
  it("keeps only files whose folder is named meshes", () => {
    expect([...keptMeshFileNames(["pantin.json", "other/a.glb"])]).toEqual([]);
  });
});
