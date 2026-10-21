import type {
  CreateJointRequest,
  ImportBodyQuery,
  PantinId,
  PantinResponse,
  PantinSummary,
} from "@pantin/protocol";
import { PantinIdSchema } from "@pantin/protocol";
import type { StepConverter } from "../converter/step-converter.ts";
import { makeUniqueId, slugifyDisplayName } from "../domain/ids.ts";
import { createInertPhysicsWorld } from "../domain/inert-physics-world.ts";
import {
  createPantinDocument,
  renamePantinDocument,
  serializePantinDocument,
} from "../domain/pantin-document.ts";
import type { PhysicsWorldFactory } from "../domain/physics-world.ts";
import { PRODUCT_LIMIT } from "../domain/spawn-planning.ts";
import type { WriteSource } from "../domain/tag-states.ts";
import { ApiError } from "../errors.ts";
import type { ExampleStore } from "../store/example-store.ts";
import type { PantinStore } from "../store/pantin-store.ts";
import { actuatorOperations } from "./actuator-operations.ts";
import { assemblyOperations } from "./assembly-operations.ts";
import { openBodyMesh, renameBodyOf } from "./body-operations.ts";
import { bridgeOperations } from "./bridge-operations.ts";
import { busOperations } from "./bus-operations.ts";
import { clockOperations, toClockState } from "./clock-operations.ts";
import { consoleOperations } from "./console-operations.ts";
import type { BridgeCoreLineWriter } from "./console-record.ts";
import { conveyorOperations } from "./conveyor-operations.ts";
import { driveOperations } from "./drive-operations.ts";
import { exampleOperations } from "./example-operations.ts";
import { checkExternalEdits, takeStamps } from "./external-edits.ts";
import { faceOperations } from "./face-operations.ts";
import { frameOperations } from "./frame-operations.ts";
import { groupOperations } from "./group-operations.ts";
import { importBodies } from "./import-operations.ts";
import { ioEditOperations } from "./io-operations.ts";
import { ioSymbolOperations } from "./io-symbol-operations.ts";
import {
  createJoint,
  deleteJoint,
  getPose,
  getPoseSnapshot,
  listJoints,
  setJointPosition,
  toPoseSnapshot,
  updateJoint,
} from "./joint-operations.ts";
import { deleteBody, discardPantin, runQueued, savePantin } from "./mesh-lifecycle.ts";
import {
  loadPantin,
  newOpenPantin,
  type OpenPantin,
  resetRuntimeState,
  type ServiceContext,
  toResponse,
  updateDocument,
} from "./open-pantins.ts";
import { orphanMeshOperations } from "./orphan-mesh-cleanup.ts";
import { disposePhysics } from "./physics-runtime.ts";
import { redundantJointsOperations } from "./redundant-joints-operations.ts";
import { readSavedDocument } from "./saved-document.ts";
import { sensorOperations } from "./sensor-operations.ts";
import { runSimulationSteps } from "./simulation.ts";
import type { SimulationTick } from "./simulation-loop.ts";
import { listSignals, listTags, releaseAllTags, releaseTag, writeTag } from "./tag-operations.ts";

// Orchestrates the Pantins: documents are edited in memory and written to disk
// only on save. One service per server instance, no shared state.

function ignoreApiError(error: unknown): undefined {
  if (error instanceof ApiError) {
    return undefined;
  }
  throw error;
}

// Open Pantins show their in-memory document (unsaved renames included);
// the others are read from disk without being opened.
async function readSummaryDocument(context: ServiceContext, pantinId: PantinId) {
  const open: Promise<OpenPantin> | undefined = context.openPantins.get(pantinId);
  return open === undefined ? readSavedDocument(context, pantinId) : (await open).document;
}

async function listPantins(context: ServiceContext): Promise<PantinSummary[]> {
  const folderNames = await context.store.listFolderNames();
  const summaries: PantinSummary[] = [];
  for (const folderName of folderNames.sort()) {
    const idResult = PantinIdSchema.safeParse(folderName);
    // Folders that are not Pantins (bad name, no or invalid pantin.json) are
    // left out of the list; GET on one of them explains what is wrong.
    if (!idResult.success) {
      continue;
    }
    const pantinId = idResult.data;
    const document = await readSummaryDocument(context, pantinId).catch(ignoreApiError);
    if (document === undefined) {
      continue;
    }
    // An open Pantin whose pantin.json vanished from disk is still listed.
    const modifiedAt =
      (await context.store.readDocumentModifiedAt(pantinId).catch(ignoreApiError)) ?? new Date();
    summaries.push({
      id: pantinId,
      name: document.name,
      bodyCount: document.bodies.length,
      modifiedAt: modifiedAt.toISOString(),
    });
  }
  return summaries;
}

async function getPantin(context: ServiceContext, pantinId: PantinId): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  // Queued after any save running: a save must not be seen between its write and its stamp.
  await runQueued(openPantin, () => checkExternalEdits(context, pantinId, openPantin));
  return toResponse(pantinId, openPantin);
}

async function createPantin(context: ServiceContext, name: string): Promise<PantinResponse> {
  const takenIds = new Set([
    ...(await context.store.listFolderNames()),
    ...context.openPantins.keys(),
  ]);
  const pantinId = makeUniqueId(slugifyDisplayName(name, "pantin"), takenIds);
  await context.store.createPantinFolder(pantinId);
  const document = createPantinDocument(name);
  await context.store.writeDocumentAtomically(pantinId, serializePantinDocument(document));
  const openPantin = newOpenPantin(
    document,
    context.newConsoleId(),
    context.physics.createWorld,
    undefined,
    await takeStamps(context, pantinId),
  );
  context.openPantins.set(pantinId, Promise.resolve(openPantin));
  context.loadedPantins.set(pantinId, openPantin);
  return toResponse(pantinId, openPantin);
}

// Frees the physics worlds (WASM memory) of every loaded Pantin and forgets
// them: the service is not used afterwards.
function closePantins(context: ServiceContext): void {
  for (const openPantin of context.loadedPantins.values()) {
    disposePhysics(openPantin);
  }
  context.loadedPantins.clear();
  context.openPantins.clear();
}

// Runtime reset without reloading the document, so unsaved edits stay (ADR 0043
// point 12). The clock and the step count are untouched (ADR 0032 point 1).
async function resetRuntime(context: ServiceContext, pantinId: PantinId): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  resetRuntimeState(context, openPantin);
  return toResponse(pantinId, openPantin);
}

function lifecycleOperations(context: ServiceContext) {
  return {
    resetRuntime: (pantinId: PantinId) => resetRuntime(context, pantinId),
    close: () => closePantins(context),
  };
}

// Sync, for the simulation tick: only Pantins already loaded.
function simulationPeeks(context: ServiceContext) {
  return {
    peekStepCount: (pantinId: PantinId) => context.loadedPantins.get(pantinId)?.stepCount,
    peekIsRunning: (pantinId: PantinId) => context.loadedPantins.get(pantinId)?.clock.running,
    peekClock: (pantinId: PantinId) => {
      const openPantin = context.loadedPantins.get(pantinId);
      return openPantin === undefined ? undefined : toClockState(openPantin);
    },
    peekPoseSnapshot: (pantinId: PantinId) => {
      const openPantin = context.loadedPantins.get(pantinId);
      return openPantin === undefined ? undefined : toPoseSnapshot(openPantin);
    },
  };
}

// Assemblies and everything a document holds besides bodies and joints, and
// the I/O mapping that names its tags.
function documentObjectOperations(context: ServiceContext) {
  return {
    ...assemblyOperations(context),
    ...groupOperations(context),
    ...frameOperations(context),
    ...driveOperations(context),
    ...actuatorOperations(context),
    ...sensorOperations(context),
    ...conveyorOperations(context),
    ...ioEditOperations(context),
    ...ioSymbolOperations(context),
    ...bridgeOperations(context),
  };
}

// The clock and the step error report are the boundaries: the real ones by
// default, tests pass their own.
export type ServiceOptions = {
  // Without it the core has no physics engine and cannot create products.
  physicsWorldFactory?: PhysicsWorldFactory;
  // The product cap of ADR 0043 point 5; tests lower it.
  productLimit?: number;
  wallClock?: () => Date;
  newConsoleId?: () => string;
  reportError?: (error: unknown) => void;
  onBridgeActivity?: (pantinId: PantinId) => void;
  writeBridgeCoreLine?: BridgeCoreLineWriter;
  // The read-only examples folder (ADR 0062); without it there are no examples.
  exampleStore?: ExampleStore;
};

export function createServiceContext(
  store: PantinStore,
  stepConverter: StepConverter | undefined,
  options: ServiceOptions,
): ServiceContext {
  return {
    store,
    exampleStore: options.exampleStore,
    openPantins: new Map(),
    loadedPantins: new Map(),
    stepConverter,
    physics: {
      createWorld: options.physicsWorldFactory ?? createInertPhysicsWorld,
      productLimit: options.productLimit ?? PRODUCT_LIMIT,
    },
    wallClock: options.wallClock ?? (() => new Date()),
    newConsoleId: options.newConsoleId ?? (() => crypto.randomUUID()),
    reportError: options.reportError ?? (() => undefined),
    onBridgeActivity: options.onBridgeActivity ?? (() => undefined),
    writeBridgeCoreLine: options.writeBridgeCoreLine ?? (() => undefined),
  };
}

// The preview-then-exact-list cleanups (ADR 0038, ADR 0060).
function cleanupOperations(context: ServiceContext) {
  return { ...orphanMeshOperations(context), ...redundantJointsOperations(context) };
}

export function createPantinService(
  store: PantinStore,
  stepConverter: StepConverter | undefined,
  options: ServiceOptions = {},
) {
  const context = createServiceContext(store, stepConverter, options);
  return {
    listPantins: () => listPantins(context),
    createPantin: (name: string) => createPantin(context, name),
    getPantin: (pantinId: PantinId) => getPantin(context, pantinId),
    renamePantin: (pantinId: PantinId, name: string) =>
      updateDocument(context, pantinId, (document) => renamePantinDocument(document, name)),
    savePantin: (pantinId: PantinId) => savePantin(context, pantinId),
    discardPantin: (pantinId: PantinId) => discardPantin(context, pantinId),
    ...exampleOperations(context),
    ...lifecycleOperations(context),
    deleteBody: (pantinId: PantinId, bodyId: string) => deleteBody(context, pantinId, bodyId),
    importBodies: (pantinId: PantinId, query: ImportBodyQuery, bytes: Uint8Array) =>
      importBodies(context, pantinId, query, bytes),
    renameBody: (pantinId: PantinId, bodyId: string, name: string) =>
      renameBodyOf(context, pantinId, bodyId, name),
    openBodyMesh: (pantinId: PantinId, meshPath: string) =>
      openBodyMesh(context, pantinId, meshPath),
    listJoints: (pantinId: PantinId) => listJoints(context, pantinId),
    createJoint: (pantinId: PantinId, request: CreateJointRequest) =>
      createJoint(context, pantinId, request),
    updateJoint: (pantinId: PantinId, jointId: string, request: CreateJointRequest) =>
      updateJoint(context, pantinId, jointId, request),
    deleteJoint: (pantinId: PantinId, jointId: string) => deleteJoint(context, pantinId, jointId),
    getPose: (pantinId: PantinId) => getPose(context, pantinId),
    getPoseSnapshot: (pantinId: PantinId) => getPoseSnapshot(context, pantinId),
    ...simulationPeeks(context),
    setJointPosition: (pantinId: PantinId, jointId: string, position: number) =>
      setJointPosition(context, pantinId, jointId, position),
    listTags: (pantinId: PantinId) => listTags(context, pantinId),
    listSignals: (pantinId: PantinId) => listSignals(context, pantinId),
    writeTag: (pantinId: PantinId, tagName: string, value: number, source: WriteSource) =>
      writeTag(context, pantinId, tagName, value, source),
    releaseTag: (pantinId: PantinId, tagName: string) => releaseTag(context, pantinId, tagName),
    releaseAllTags: (pantinId: PantinId) => releaseAllTags(context, pantinId),
    ...busOperations(context),
    ...consoleOperations(context),
    ...faceOperations(context),
    runSimulationSteps: (tick: SimulationTick) => runSimulationSteps(context, tick),
    ...clockOperations(context),
    ...documentObjectOperations(context),
    ...cleanupOperations(context),
  };
}

export type PantinService = ReturnType<typeof createPantinService>;
