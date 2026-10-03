import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPantinStore } from "./pantin-store.ts";

// The meshes folder as a flat list of regular files (ADR 0038, store).

let root: string;
let meshes: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pantin-store-"));
  meshes = join(root, "pantins", "axis", "meshes");
  await mkdir(meshes, { recursive: true });
  await writeFile(join(root, "outside.stl"), "outside");
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

const store = () => createPantinStore(join(root, "pantins"));

describe("listMeshFolderFiles", () => {
  it("lists regular files with their sizes and skips subfolders and symbolic links", async () => {
    await writeFile(join(meshes, "a.glb"), "12345");
    await mkdir(join(meshes, "folder.glb"));
    await symlink(join(root, "outside.stl"), join(meshes, "link.stl"));
    expect(await store().listMeshFolderFiles("axis")).toEqual([
      { fileName: "a.glb", sizeInBytes: 5 },
    ]);
  });

  it("gives an empty list when meshes/ is missing", async () => {
    await rm(meshes, { recursive: true });
    expect(await store().listMeshFolderFiles("axis")).toEqual([]);
  });
});

describe("deleteMeshFolderFile", () => {
  it("deletes a regular file", async () => {
    await writeFile(join(meshes, "a.glb"), "x");
    expect(await store().deleteMeshFolderFile("axis", "a.glb", () => true)).toBe("deleted");
    expect(await store().listMeshFolderFiles("axis")).toEqual([]);
  });

  it("answers not_a_file for a symbolic link and leaves its target unchanged", async () => {
    await symlink(join(root, "outside.stl"), join(meshes, "link.stl"));
    expect(await store().deleteMeshFolderFile("axis", "link.stl", () => true)).toBe("not_a_file");
    expect((await lstat(join(meshes, "link.stl"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(root, "outside.stl"), "utf8")).toBe("outside");
  });

  it("leaves the file when mayDelete refuses", async () => {
    await writeFile(join(meshes, "a.glb"), "x");
    expect(await store().deleteMeshFolderFile("axis", "a.glb", () => false)).toBe("kept");
    expect(await store().listMeshFolderFiles("axis")).toHaveLength(1);
  });

  it("refuses a meshes/ that links to another Pantin's meshes/, and deletes nothing", async () => {
    const other = join(root, "pantins", "other", "meshes");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "a.glb"), "x");
    await rm(meshes, { recursive: true });
    await symlink(other, meshes);
    await expect(store().listMeshFolderFiles("axis")).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(store().deleteMeshFolderFile("axis", "a.glb", () => true)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(await readFile(join(other, "a.glb"), "utf8")).toBe("x");
  });

  it("refuses a Pantin folder that is a symbolic link", async () => {
    await rename(join(root, "pantins", "axis"), join(root, "real-axis"));
    await symlink(join(root, "real-axis"), join(root, "pantins", "axis"));
    await expect(store().listMeshFolderFiles("axis")).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("answers missing for a file that does not exist", async () => {
    expect(await store().deleteMeshFolderFile("axis", "nothing.glb", () => true)).toBe("missing");
  });
});
