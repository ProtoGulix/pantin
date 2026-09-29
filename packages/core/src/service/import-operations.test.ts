import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StepConverter } from "../converter/step-converter.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { MINIMAL_STEP_TEXT, TWO_COMPONENTS } from "../test-support/fake-step-converter.ts";
import { storeHoldingMeshWrites } from "../test-support/held-mesh-store.ts";
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

const oneComponent: StepConverter = async () =>
  TWO_COMPONENTS.components.slice(0, 1).map((component) => ({
    name: component.name,
    nodes: component.nodes,
    glbBytes: buildSampleGlb(),
  }));

const STEP_BYTES = new TextEncoder().encode(MINIMAL_STEP_TEXT);

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
  it("removes the joints, the bodies, the assembly and the mesh already written when a later write fails", async () => {
    const service = createPantinService(storeFailingOnSecondWrite(), twoComponents);
    await service.createPantin("Axis");
    await expect(
      service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES),
    ).rejects.toThrow("disk full");
    const pantin = await service.getPantin("axis");
    expect(pantin.document.joints).toEqual([]);
    expect(pantin.document.bodies).toEqual([]);
    expect(pantin.document.assemblies).toEqual([]);
    expect(pantin.unsavedChanges).toBe(false);
    expect(await readdir(join(pantinsDirectory, "axis", "meshes"))).toEqual([]);
  });

  it("imports both components, the second fixed to the first, when every write succeeds", async () => {
    const service = createPantinService(createPantinStore(pantinsDirectory), twoComponents);
    await service.createPantin("Axis");
    const { bodies, joints } = await service.importBodies(
      "axis",
      { fileName: "axis.step" },
      STEP_BYTES,
    );
    expect(bodies).toHaveLength(2);
    expect(joints).toMatchObject([{ type: "fixed", parent: bodies[0]?.id, child: bodies[1]?.id }]);
    expect((await service.getPantin("axis")).document.joints).toEqual(joints);
  });
});

describe("importBodies joints (ADR 0017)", () => {
  it("creates no joint for a STEP file with a single component", async () => {
    const service = createPantinService(createPantinStore(pantinsDirectory), oneComponent);
    await service.createPantin("Axis");
    const { bodies, joints } = await service.importBodies(
      "axis",
      { fileName: "axis.step" },
      STEP_BYTES,
    );
    expect(bodies).toHaveLength(1);
    expect(joints).toEqual([]);
  });

  it("makes a joint deletion wait until the import that created the joint settles", async () => {
    const held = storeHoldingMeshWrites(pantinsDirectory, false);
    const service = createPantinService(held.store, twoComponents);
    await service.createPantin("Axis");
    const importing = service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES);
    await held.meshWriteStarted;
    const [joint] = (await service.getPantin("axis")).document.joints;
    let deleted = false;
    const deleting = service.deleteJoint("axis", joint?.id ?? "").then(() => {
      deleted = true;
    });
    // Give an unguarded deletion every chance to finish while the write is held.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deleted).toBe(false);
    held.release();
    await importing;
    await deleting;
    expect((await service.getPantin("axis")).document.joints).toEqual([]);
  });
});
