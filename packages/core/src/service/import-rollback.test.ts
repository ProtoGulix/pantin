import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FaceFileSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StepConverter } from "../converter/step-converter.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import {
  MINIMAL_STEP_TEXT,
  SAMPLE_FACE_FILE,
  TWO_COMPONENTS,
} from "../test-support/fake-step-converter.ts";
import { buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import { createPantinService } from "./pantin-service.ts";

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-import-rollback-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

const twoComponents: StepConverter = async () => ({
  assemblyNodes: [],
  components: TWO_COMPONENTS.components.map((component) => ({
    name: component.name,
    nodes: component.nodes,
    glbBytes: buildSampleGlb(),
    faceFile: undefined,
  })),
});

const STEP_BYTES = new TextEncoder().encode(MINIMAL_STEP_TEXT);

function meshesOf(): Promise<string[]> {
  return readdir(join(pantinsDirectory, "axis", "meshes"));
}

// The second write leaves `leftover` behind (a full disk keeps what it wrote)
// and fails.
function storeFailingOnSecondWrite(
  store: PantinStore,
  failWith: (meshPath: string) => Promise<void>,
): PantinStore {
  let writes = 0;
  return {
    ...store,
    writeMesh: async (pantinId, meshPath, bytes) => {
      writes += 1;
      if (writes === 2) {
        await failWith(meshPath);
        return;
      }
      await store.writeMesh(pantinId, meshPath, bytes);
    },
  };
}

describe("import rollback", () => {
  it("deletes the mesh whose write failed half way, and rethrows the original error", async () => {
    const real = createPantinStore(pantinsDirectory);
    const store = storeFailingOnSecondWrite(real, async (meshPath) => {
      await writeFile(join(pantinsDirectory, "axis", meshPath), "partial");
      throw new Error("disk full");
    });
    const service = createPantinService(store, twoComponents);
    await service.createPantin("Axis");
    await expect(
      service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES),
    ).rejects.toThrow("disk full");
    expect(await meshesOf()).toEqual([]);
  });
});

describe("import rollback and existing files", () => {
  it("never deletes a file that already existed (exclusive creation refused it)", async () => {
    const real = createPantinStore(pantinsDirectory);
    const store = storeFailingOnSecondWrite(real, async (meshPath) => {
      // Someone else's file appears at that name before our write.
      await writeFile(join(pantinsDirectory, "axis", meshPath), "someone else's");
      return await real.writeMesh("axis", meshPath, new Uint8Array());
    });
    const service = createPantinService(store, twoComponents);
    await service.createPantin("Axis");
    await expect(
      service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await meshesOf()).toHaveLength(1);
  });

  it("tries every deletion, reports the failures and still rethrows the original error", async () => {
    const real = createPantinStore(pantinsDirectory);
    const attempted: string[] = [];
    const store: PantinStore = {
      ...storeFailingOnSecondWrite(real, async () => {
        throw new Error("disk full");
      }),
      deleteMesh: async (_pantinId, meshPath) => {
        attempted.push(meshPath);
        throw new Error("EACCES: read-only");
      },
    };
    const reported: unknown[] = [];
    const service = createPantinService(store, twoComponents, {
      reportError: (error) => reported.push(error),
    });
    await service.createPantin("Axis");
    await expect(
      service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES),
    ).rejects.toThrow("disk full");
    // The first mesh was written, the second failed half way: both are tried.
    expect(attempted).toHaveLength(2);
    expect(reported).toHaveLength(2);
    expect(String(reported[0])).toContain("EACCES");
    expect((await service.getPantin("axis")).document.bodies).toEqual([]);
  });
});

describe("import rollback and an existing face file", () => {
  it("deletes the mesh it created but never the face file that was already there", async () => {
    const real = createPantinStore(pantinsDirectory);
    const withFaceFile: StepConverter = async () => {
      const converted = await twoComponents(new Uint8Array());
      return {
        ...converted,
        components: converted.components.map((component) => ({
          ...component,
          faceFile: FaceFileSchema.parse(SAMPLE_FACE_FILE),
        })),
      };
    };
    const store: PantinStore = {
      ...real,
      writeFaceFile: async (pantinId, meshPath, bytes) => {
        // Someone else's face file appears at that name before our write.
        await writeFile(
          join(pantinsDirectory, "axis", meshPath.replace(/\.glb$/, ".faces.json")),
          "someone else's",
        );
        await real.writeFaceFile(pantinId, meshPath, bytes);
      },
    };
    const service = createPantinService(store, withFaceFile);
    await service.createPantin("Axis");
    await expect(
      service.importBodies("axis", { fileName: "axis.step" }, STEP_BYTES),
    ).rejects.toMatchObject({ code: "conflict" });
    const left = await meshesOf();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/\.faces\.json$/);
  });
});
