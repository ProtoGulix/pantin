import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeHoldingMeshWrites } from "../test-support/held-mesh-store.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { createPantinService } from "./pantin-service.ts";

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-discard-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

function meshExists(meshPath: string): Promise<boolean> {
  return access(join(pantinsDirectory, "axis", meshPath)).then(
    () => true,
    () => false,
  );
}

describe("discarding while an import is writing its meshes", () => {
  it("waits for the import, then removes its body and its mesh", async () => {
    const held = storeHoldingMeshWrites(pantinsDirectory, false);
    const service = createPantinService(held.store, undefined);
    await service.createPantin("Axis");
    const importing = service.importBodies(
      "axis",
      { fileName: "b.stl", unit: "mm" },
      buildAsciiStl(),
    );
    await held.meshWriteStarted;
    const discarding = service.discardPantin("axis");
    // Give an unguarded discard every chance to finish while the mesh write is
    // held; a correct one keeps waiting for the import.
    await Promise.race([discarding, new Promise((resolve) => setTimeout(resolve, 100))]);
    held.release();
    const [body] = await importing;
    const discarded = await discarding;
    expect(discarded).toMatchObject({ unsavedChanges: false, document: { bodies: [] } });
    expect(body === undefined ? true : await meshExists(body.mesh)).toBe(false);
    expect((await service.getPantin("axis")).document.bodies).toEqual([]);
  });
});

describe("deleting a body whose import is writing its mesh", () => {
  it("waits for the write, then deletes the file: no stray mesh remains", async () => {
    const held = storeHoldingMeshWrites(pantinsDirectory, false);
    const service = createPantinService(held.store, undefined);
    await service.createPantin("Axis");
    const importing = service.importBodies(
      "axis",
      { fileName: "b.stl", unit: "mm" },
      buildAsciiStl(),
    );
    await held.meshWriteStarted;
    // The body is already reserved in the document, under its file name's id.
    const deleting = service.deleteBody("axis", "b");
    await Promise.race([deleting, new Promise((resolve) => setTimeout(resolve, 100))]);
    held.release();
    await importing;
    const deleted = await deleting;
    expect(deleted.document.bodies).toEqual([]);
    expect(await meshExists("meshes/b.stl")).toBe(false);
  });
});
