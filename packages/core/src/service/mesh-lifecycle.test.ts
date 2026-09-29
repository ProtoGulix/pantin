import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { storeHoldingMeshWrites } from "../test-support/held-mesh-store.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { createPantinService } from "./pantin-service.ts";

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-mesh-lifecycle-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

// A store whose pantin.json writes wait, once armed, until the test opens the
// gate: this places a deletion exactly while a save is in flight.
function gatedStore(): { store: PantinStore; arm: () => void; openGate: () => void } {
  const store = createPantinStore(pantinsDirectory);
  let gate: Promise<void> = Promise.resolve();
  let openGate = (): void => undefined;
  return {
    store: {
      ...store,
      writeDocumentAtomically: async (pantinId, text) => {
        await gate;
        await store.writeDocumentAtomically(pantinId, text);
      },
    },
    arm: () => {
      gate = new Promise((resolve) => {
        openGate = resolve;
      });
    },
    openGate: () => openGate(),
  };
}

function meshExists(meshPath: string): Promise<boolean> {
  return access(join(pantinsDirectory, "axis", meshPath)).then(
    () => true,
    () => false,
  );
}

describe("deleting a body while a save is in flight", () => {
  it("keeps the mesh the saved pantin.json references, then deletes it on the next save", async () => {
    const gated = gatedStore();
    const service = createPantinService(gated.store, undefined);
    await service.createPantin("Axis");
    const [body] = await service.importBodies(
      "axis",
      { fileName: "b.stl", unit: "mm" },
      buildAsciiStl(),
    );
    if (body === undefined) {
      throw new Error("import returned no body");
    }
    gated.arm();
    const saving = service.savePantin("axis"); // serializes the document with the body
    await new Promise((resolve) => setImmediate(resolve));
    await service.deleteBody("axis", body.id);
    expect(await meshExists(body.mesh)).toBe(true);
    gated.openGate();
    await saving;
    expect(await meshExists(body.mesh)).toBe(true); // pantin.json on disk lists it
    const next = await service.savePantin("axis");
    expect(next.document.bodies).toEqual([]);
    expect(await meshExists(body.mesh)).toBe(false);
  });
});

describe("saving while an import is writing its meshes", () => {
  it.each([
    ["the import succeeds", false, 1],
    ["the import rolls back", true, 0],
  ])(
    "never writes a pantin.json listing an unwritten mesh when %s",
    async (_case, failWrites, bodyCount) => {
      const held = storeHoldingMeshWrites(pantinsDirectory, failWrites);
      const service = createPantinService(held.store, undefined);
      await service.createPantin("Axis");
      const importing = service
        .importBodies("axis", { fileName: "b.stl", unit: "mm" }, buildAsciiStl())
        .catch((error: unknown) => error);
      // Ids are reserved and the mesh write is held: save lands exactly in the gap.
      await held.meshWriteStarted;
      const saving = service.savePantin("axis");
      await new Promise((resolve) => setImmediate(resolve));
      held.release();
      await importing;
      const saved = await saving;
      expect(held.missingAtSave).toEqual([]);
      expect(saved.document.bodies).toHaveLength(bodyCount);
      expect(saved.unsavedChanges).toBe(false);
    },
  );
});
