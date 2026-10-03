import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Body, CreateJointRequest } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { SAMPLE_FACE_FILE } from "../test-support/fake-step-converter.ts";
import { storeHoldingMeshWrites } from "../test-support/held-mesh-store.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { buildAsciiStl, buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import { actuatorOperations } from "./actuator-operations.ts";
import { deleteAssemblyWithContentsOf } from "./assembly-deletion.ts";
import { assemblyOperations } from "./assembly-operations.ts";
import { driveOperations } from "./drive-operations.ts";
import { importBodies } from "./import-operations.ts";
import { createJoint, getPose } from "./joint-operations.ts";
import { discardPantin, savePantin } from "./mesh-lifecycle.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";
import { createPantinService } from "./pantin-service.ts";
import { sensorOperations } from "./sensor-operations.ts";
import { startSimulationLoop } from "./simulation-loop.ts";

// Deleting an assembly with its contents, through the service (ADR 0037
// point 6). Two imports make two assemblies, "rail" and "carriage", hung by
// one prismatic joint between them.

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-assembly-deletion-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

const AXIS: CreateJointRequest = {
  type: "prismatic",
  name: "Axe X",
  parent: "rail",
  child: "carriage",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 1],
};

function contextOver(store: PantinStore): ServiceContext {
  return {
    store,
    openPantins: new Map(),
    loadedPantins: new Map(),
    stepConverter: undefined,
    wallClock: () => new Date(0),
    newConsoleId: () => "console",
    reportStepError: () => undefined,
  };
}

async function importStl(context: ServiceContext, fileName: string): Promise<Body> {
  const { bodies } = await importBodies(context, "axis", { fileName, unit: "mm" }, buildAsciiStl());
  const [body] = bodies;
  if (body === undefined) {
    throw new Error("import returned no body");
  }
  return body;
}

// A Pantin on disk with no body, opened by a context of its own.
async function newAxis(store: PantinStore = createPantinStore(pantinsDirectory)) {
  await createPantinService(store, undefined).createPantin("Axis");
  return contextOver(store);
}

function fileExists(relativePath: string): Promise<boolean> {
  return access(join(pantinsDirectory, "axis", relativePath)).then(
    () => true,
    () => false,
  );
}

describe("mesh and face files", () => {
  it("deletes the GLB and its face file at once after an unsaved import", async () => {
    const context = await newAxis();
    const { bodies } = await importBodies(
      context,
      "axis",
      { fileName: "part.glb" },
      buildSampleGlb(),
    );
    const mesh = bodies[0]?.mesh ?? "";
    const faces = mesh.replace(/\.glb$/, ".faces.json");
    await context.store.writeFaceFile("axis", mesh, Buffer.from(JSON.stringify(SAMPLE_FACE_FILE)));
    expect([await fileExists(mesh), await fileExists(faces)]).toEqual([true, true]);
    const answer = await deleteAssemblyWithContentsOf(context, "axis", "part");
    expect([await fileExists(mesh), await fileExists(faces)]).toEqual([false, false]);
    expect(answer.retainedMeshFiles).toEqual([]);
    expect(answer.pantin.document.assemblies).toEqual([]);
  });
});

describe("files of a saved assembly", () => {
  it("keeps the files of a saved assembly until the next save", async () => {
    const context = await newAxis();
    const rail = await importStl(context, "rail.stl");
    await savePantin(context, "axis");
    const answer = await deleteAssemblyWithContentsOf(context, "axis", "rail");
    expect(answer.pantin.unsavedChanges).toBe(true);
    expect(answer.retainedMeshFiles).toEqual([]);
    expect(await fileExists(rail.mesh)).toBe(true);
    await savePantin(context, "axis");
    expect(await fileExists(rail.mesh)).toBe(false);
  });

  it("brings the assembly back with its files when the deletion is discarded", async () => {
    const context = await newAxis();
    const rail = await importStl(context, "rail.stl");
    await savePantin(context, "axis");
    await deleteAssemblyWithContentsOf(context, "axis", "rail");
    const restored = await discardPantin(context, "axis");
    expect(restored.document.assemblies.map(({ key }) => key)).toEqual(["rail"]);
    expect(restored.document.bodies.map(({ id }) => id)).toEqual([rail.id]);
    expect(await fileExists(rail.mesh)).toBe(true);
  });
});

describe("a file that cannot be deleted", () => {
  it("keeps the document change and reports a file it could not delete, which the next save retries", async () => {
    let failing = true;
    const store = createPantinStore(pantinsDirectory);
    const context = await newAxis({
      ...store,
      deleteMesh: async (pantinId, meshPath) => {
        if (failing) {
          throw new Error("EACCES");
        }
        await store.deleteMesh(pantinId, meshPath);
      },
    });
    const rail = await importStl(context, "rail.stl");
    const answer = await deleteAssemblyWithContentsOf(context, "axis", "rail");
    expect(answer.pantin.document.assemblies).toEqual([]);
    expect(answer.retainedMeshFiles).toEqual([rail.mesh]);
    const openPantin = await loadPantin(context, "axis");
    expect([...openPantin.pendingMeshDeletions]).toEqual([rail.mesh]);
    failing = false;
    await savePantin(context, "axis");
    expect(await fileExists(rail.mesh)).toBe(false);
    expect(openPantin.pendingMeshDeletions.size).toBe(0);
  });
});

describe("a file taken again while the files are released", () => {
  it("keeps the file that a concurrent import reused", async () => {
    const store = createPantinStore(pantinsDirectory);
    let context: ServiceContext | undefined;
    let reimported: Body | undefined;
    let secondMesh = "";
    const wrapped: PantinStore = {
      ...store,
      deleteMesh: async (pantinId, meshPath) => {
        await store.deleteMesh(pantinId, meshPath);
        // Right after the first file goes, a new import takes the name of the
        // second, which an earlier release freed on disk.
        if (context !== undefined && reimported === undefined) {
          await store.deleteMesh(pantinId, secondMesh);
          reimported = await importStl(context, "second.stl");
        }
      },
    };
    context = await newAxis(wrapped);
    await importStl(context, "first.stl");
    const second = await importStl(context, "second.stl");
    secondMesh = second.mesh;
    await assemblyOperations(context).moveBody("axis", second.id, "first");
    await deleteAssemblyWithContentsOf(context, "axis", "first");
    // The ids are free again, so the new body got the same file name.
    expect(reimported?.mesh).toBe(second.mesh);
    expect(await fileExists(second.mesh)).toBe(true);
    expect((await loadPantin(context, "axis")).document.bodies.map(({ id }) => id)).toEqual([
      second.id,
    ]);
  });
});

describe("timing", () => {
  it("waits for an import still in flight, then removes its assembly and file", async () => {
    const held = storeHoldingMeshWrites(pantinsDirectory, false);
    const context = await newAxis(held.store);
    const importing = importStl(context, "rail.stl");
    await held.meshWriteStarted;
    let deleted = false;
    const deleting = deleteAssemblyWithContentsOf(context, "axis", "rail").then((answer) => {
      deleted = true;
      return answer;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(deleted).toBe(false);
    held.release();
    const rail = await importing;
    const answer = await deleting;
    expect(answer.deleted.bodies.map(({ id }) => id)).toEqual([rail.id]);
    expect(await fileExists(rail.mesh)).toBe(false);
  });

  it("lets the simulation step on after a deletion while the clock runs", async () => {
    const errors: unknown[] = [];
    const service = createPantinService(createPantinStore(pantinsDirectory), undefined, {
      reportStepError: (error) => errors.push(error),
    });
    const manual = createManualTimer();
    startSimulationLoop(manual.timer, service.runSimulationSteps, () => undefined);
    await service.createPantin("Axis");
    await service.importBodies("axis", { fileName: "rail.stl", unit: "mm" }, buildAsciiStl());
    await service.importBodies("axis", { fileName: "carriage.stl", unit: "mm" }, buildAsciiStl());
    await service.createJoint("axis", AXIS);
    manual.advance(STEP_SECONDS);
    const stepsBefore = service.peekStepCount("axis") ?? 0;
    expect(stepsBefore).toBeGreaterThan(0);
    await service.deleteAssemblyWithContents("axis", "carriage");
    manual.advance(STEP_SECONDS * 3);
    expect(service.peekStepCount("axis")).toBeGreaterThan(stepsBefore);
    expect(errors).toEqual([]);
  });
});

// "carriage" gets a drive, a sensor on its joint and an actuator that moves
// a joint of "rail"; "rail" gets that joint.
async function addCarriageContents(context: ServiceContext): Promise<void> {
  await driveOperations(context).createDrive("axis", {
    name: "Valve",
    assembly: "carriage",
    type: "valve_5_3_closed",
  });
  await sensorOperations(context).createSensor("axis", {
    name: "End",
    assembly: "carriage",
    joint: "axe-x",
    type: "position_switch",
    range: [0.4, 0.6],
    normallyClosed: false,
  });
  // A joint of "rail" moved by an actuator of "carriage": it must stop.
  await importStl(context, "stop.stl");
  await assemblyOperations(context).moveBody("axis", "stop", "rail");
  await createJoint(context, "axis", { ...AXIS, name: "Stop", child: "stop" });
  await actuatorOperations(context).createActuator("axis", {
    name: "Pusher",
    assembly: "carriage",
    type: "double_acting_cylinder",
    extendSpeed: 0.2,
    retractSpeed: 0.2,
    joints: ["stop"],
  });
}

describe("runtime state", () => {
  it("forgets what the removed joints, drives and sensors left", async () => {
    const context = await newAxis();
    await importStl(context, "rail.stl");
    await importStl(context, "carriage.stl");
    await createJoint(context, "axis", AXIS);
    await addCarriageContents(context);
    const openPantin = await loadPantin(context, "axis");
    openPantin.jointPositions.set("axe-x", 0.5);
    openPantin.setpoints.set("axe-x", 0.5);
    openPantin.jointVelocities.set("axe-x", 0.1);
    openPantin.jammedJointIds.add("axe-x");
    openPantin.driveCommands.set("valve", { coil_14: 1 });
    openPantin.unresponsiveDriveIds.add("valve");
    openPantin.sensorOutputs.set("end", { values: { state: 1 }, state: {} });
    openPantin.jointVelocities.set("stop", 0.2);

    await deleteAssemblyWithContentsOf(context, "axis", "carriage");

    expect(openPantin.jointPositions.has("axe-x")).toBe(false);
    expect(openPantin.setpoints.has("axe-x")).toBe(false);
    expect(openPantin.jointVelocities.has("axe-x")).toBe(false);
    expect(openPantin.jammedJointIds.size).toBe(0);
    expect(openPantin.driveCommands.has("valve")).toBe(false);
    expect(openPantin.unresponsiveDriveIds.size).toBe(0);
    expect(openPantin.sensorOutputs.has("end")).toBe(false);
    expect(openPantin.document.joints.map(({ id }) => id)).toEqual(["stop"]);
    expect(openPantin.jointVelocities.has("stop")).toBe(false);
  });

  it("starts a new joint with a reused id at position 0", async () => {
    const context = await newAxis();
    await importStl(context, "rail.stl");
    await importStl(context, "carriage.stl");
    await createJoint(context, "axis", AXIS);
    (await loadPantin(context, "axis")).jointPositions.set("axe-x", 0.5);
    await deleteAssemblyWithContentsOf(context, "axis", "carriage");
    await importStl(context, "carriage.stl");
    await createJoint(context, "axis", AXIS);
    const pose = await getPose(context, "axis");
    expect(pose.jointPositions).toEqual([{ jointId: "axe-x", position: 0 }]);
  });
});
