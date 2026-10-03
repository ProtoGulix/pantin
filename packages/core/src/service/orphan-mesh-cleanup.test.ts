import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { storeHoldingMeshWrites } from "../test-support/held-mesh-store.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { createPantinService } from "./pantin-service.ts";
import { startSimulationLoop } from "./simulation-loop.ts";

// Cleaning orphan mesh files through the service (ADR 0038 points 1 to 6).

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-orphans-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

async function newAxis(store: PantinStore = createPantinStore(pantinsDirectory)) {
  const service = createPantinService(store, undefined);
  await service.createPantin("Axis");
  return service;
}

const importStl = async (service: Awaited<ReturnType<typeof newAxis>>, fileName: string) => {
  const { bodies } = await service.importBodies("axis", { fileName, unit: "mm" }, buildAsciiStl());
  const [body] = bodies;
  if (body === undefined) {
    throw new Error("import returned no body");
  }
  return body;
};

const dropFile = (name: string) => writeFile(join(pantinsDirectory, "axis", "meshes", name), "x");

function meshExists(name: string): Promise<boolean> {
  return access(join(pantinsDirectory, "axis", "meshes", name)).then(
    () => true,
    () => false,
  );
}

const settleSoon = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("what is not an orphan", () => {
  it("keeps the file of an unsaved import and of a saved body deleted but not yet saved", async () => {
    const service = await newAxis();
    await importStl(service, "rail.stl");
    const saved = await importStl(service, "carriage.stl");
    await service.savePantin("axis");
    await service.deleteBody("axis", saved.id);
    await importStl(service, "fresh.stl");
    expect((await service.listOrphanMeshes("axis")).files).toEqual([]);
    expect(await meshExists("carriage.stl")).toBe(true);
  });
});

describe("a file left by an import that was never saved", () => {
  it("is listed, then deleted, with the document and the unsaved flag unchanged", async () => {
    const service = await newAxis();
    await importStl(service, "rail.stl");
    await service.savePantin("axis");
    await dropFile("ghost.glb");
    await dropFile("ghost.faces.json");
    const before = await service.getPantin("axis");
    const list = await service.listOrphanMeshes("axis");
    expect(list.files.map(({ fileName }) => fileName)).toEqual(["ghost.faces.json", "ghost.glb"]);
    const fileNames = list.files.map(({ fileName }) => fileName);
    const answer = await service.deleteOrphanMeshes("axis", fileNames);
    expect(answer.deleted).toEqual(list.files);
    expect([answer.skipped, answer.failed]).toEqual([[], []]);
    expect(await meshExists("ghost.glb")).toBe(false);
    expect(await meshExists("rail.stl")).toBe(true);
    expect(await service.getPantin("axis")).toEqual(before);
  });
});

describe("requested names that are not deletable", () => {
  it("skips a used, a missing and a non-mesh name and leaves the files in place", async () => {
    const service = await newAxis();
    const rail = await importStl(service, "rail.stl");
    await dropFile("notes.txt");
    await dropFile("ghost.stl");
    const answer = await service.deleteOrphanMeshes("axis", [
      "ghost.stl",
      "ghost.stl",
      "rail.stl",
      "missing.glb",
      "notes.txt",
    ]);
    expect(answer.deleted.map(({ fileName }) => fileName)).toEqual(["ghost.stl"]);
    expect(answer.skipped).toEqual(["rail.stl", "missing.glb", "notes.txt"]);
    expect(await meshExists("notes.txt")).toBe(true);
    expect(await meshExists(rail.mesh.replace("meshes/", ""))).toBe(true);
  });
});

describe("a file that cannot be deleted", () => {
  it("reports its error code and deletes the others", async () => {
    const real = createPantinStore(pantinsDirectory);
    const service = await newAxis({
      ...real,
      deleteMeshFolderFile: async (pantinId, fileName, mayDelete) => {
        if (fileName === "b.stl") {
          throw Object.assign(new Error("denied: /secret/path"), { code: "EACCES" });
        }
        return real.deleteMeshFolderFile(pantinId, fileName, mayDelete);
      },
    });
    for (const name of ["a.stl", "b.stl", "c.stl"]) {
      await dropFile(name);
    }
    const answer = await service.deleteOrphanMeshes("axis", ["a.stl", "b.stl", "c.stl"]);
    expect(answer.failed).toEqual([{ fileName: "b.stl", errorCode: "EACCES" }]);
    expect(answer.deleted.map(({ fileName }) => fileName)).toEqual(["a.stl", "c.stl"]);
    expect(await meshExists("b.stl")).toBe(true);
  });
});

describe("the retry after a save", () => {
  it("leaves a file the retry could not delete, which the cleanup lists and deletes", async () => {
    const real = createPantinStore(pantinsDirectory);
    const service = await newAxis({
      ...real,
      deleteMesh: async () => {
        throw new Error("EBUSY");
      },
    });
    const rail = await importStl(service, "rail.stl");
    await service.savePantin("axis");
    await service.deleteBody("axis", rail.id);
    await expect(service.savePantin("axis")).rejects.toThrow("EBUSY");
    expect((await service.listOrphanMeshes("axis")).files.map((f) => f.fileName)).toEqual([
      "rail.stl",
    ]);
    const answer = await service.deleteOrphanMeshes("axis", ["rail.stl"]);
    expect(answer.deleted).toHaveLength(1);
    expect(await meshExists("rail.stl")).toBe(false);
  });
});

describe("ordering", () => {
  it("waits for an in-flight import, which keeps its own file", async () => {
    const held = storeHoldingMeshWrites(pantinsDirectory, false);
    const service = await newAxis(held.store);
    await dropFile("ghost.stl");
    const importing = service.importBodies(
      "axis",
      { fileName: "b.stl", unit: "mm" },
      buildAsciiStl(),
    );
    await held.meshWriteStarted;
    let settled = false;
    const deleting = service.deleteOrphanMeshes("axis", ["ghost.stl"]).then((answer) => {
      settled = true;
      return answer;
    });
    await settleSoon();
    expect([settled, await meshExists("ghost.stl")]).toEqual([false, true]);
    held.release();
    await importing;
    expect((await deleting).deleted).toHaveLength(1);
    expect(await meshExists("b.stl")).toBe(true);
  });

  it("waits for a save already queued", async () => {
    const real = createPantinStore(pantinsDirectory);
    let openGate = (): void => undefined;
    let gate: Promise<void> = Promise.resolve();
    const service = await newAxis({
      ...real,
      writeDocumentAtomically: async (pantinId, text) => {
        await gate;
        await real.writeDocumentAtomically(pantinId, text);
      },
    });
    await dropFile("ghost.stl");
    gate = new Promise((resolve) => {
      openGate = resolve;
    });
    const saving = service.savePantin("axis");
    let settled = false;
    const deleting = service.deleteOrphanMeshes("axis", ["ghost.stl"]).then(() => {
      settled = true;
    });
    await settleSoon();
    expect([settled, await meshExists("ghost.stl")]).toEqual([false, true]);
    openGate();
    await Promise.all([saving, deleting]);
    expect(await meshExists("ghost.stl")).toBe(false);
  });
});

describe("while the clock runs", () => {
  it("is followed by a simulation step that runs without error", async () => {
    const service = createPantinService(createPantinStore(pantinsDirectory), undefined);
    const manual = createManualTimer();
    const errors: unknown[] = [];
    startSimulationLoop(manual.timer, service.runSimulationSteps, (error) => errors.push(error));
    await service.createPantin("Axis");
    await dropFile("ghost.stl");
    manual.advance(STEP_SECONDS);
    await service.deleteOrphanMeshes("axis", ["ghost.stl"]);
    manual.advance(STEP_SECONDS);
    expect(service.peekStepCount("axis")).toBe(2);
    expect(errors).toEqual([]);
  });
});
