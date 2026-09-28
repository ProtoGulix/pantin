import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StepConverter } from "../converter/step-converter.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { MINIMAL_STEP_TEXT, TWO_COMPONENTS } from "../test-support/fake-step-converter.ts";
import { buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import { createPantinService } from "./pantin-service.ts";

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-import-operations-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

const twoComponents: StepConverter = async () =>
  TWO_COMPONENTS.components.map((component) => ({
    name: component.name,
    nodes: component.nodes,
    glbBytes: buildSampleGlb(),
  }));

// A store whose second mesh write fails, after the first one succeeded.
function storeFailingOnSecondWrite(): PantinStore {
  const store = createPantinStore(pantinsDirectory);
  let writes = 0;
  return {
    ...store,
    writeMesh: async (pantinId, meshPath, bytes) => {
      writes += 1;
      if (writes === 2) {
        throw new Error("disk full");
      }
      await store.writeMesh(pantinId, meshPath, bytes);
    },
  };
}

describe("importBodies rollback", () => {
  it("removes the bodies and the mesh already written when a later write fails", async () => {
    const service = createPantinService(storeFailingOnSecondWrite(), twoComponents);
    await service.createPantin("Axis");
    const step = new TextEncoder().encode(MINIMAL_STEP_TEXT);
    await expect(service.importBodies("axis", { fileName: "axis.step" }, step)).rejects.toThrow(
      "disk full",
    );
    const pantin = await service.getPantin("axis");
    expect(pantin.document.bodies).toEqual([]);
    expect(pantin.unsavedChanges).toBe(false);
    expect(await readdir(join(pantinsDirectory, "axis", "meshes"))).toEqual([]);
  });

  it("imports both components when every write succeeds", async () => {
    const service = createPantinService(createPantinStore(pantinsDirectory), twoComponents);
    await service.createPantin("Axis");
    const step = new TextEncoder().encode(MINIMAL_STEP_TEXT);
    const bodies = await service.importBodies("axis", { fileName: "axis.step" }, step);
    expect(bodies).toHaveLength(2);
  });
});
