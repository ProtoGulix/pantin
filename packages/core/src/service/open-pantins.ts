import type { PantinDocument, PantinId, PantinResponse } from "@pantin/protocol";
import type { StepConverter } from "../converter/step-converter.ts";
import { parsePantinDocument, serializePantinDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";

// In-memory Pantins of one service instance: documents are edited here and
// written to disk only on save.

export type OpenPantin = {
  document: PantinDocument;
  // Canonical text of pantin.json on disk, to detect unsaved changes.
  savedText: string;
  // Meshes referenced by pantin.json on disk, and by the one being written.
  savedMeshPaths: Set<string>;
  writingMeshPaths: Set<string>;
  // Meshes of deleted bodies that pantin.json still references: deleted
  // after the next save, so the disk never references a missing mesh.
  pendingMeshDeletions: Set<string>;
  // Saves of one Pantin run one after the other.
  saveQueue: Promise<unknown>;
  // One promise per import whose bodies are in the document but whose mesh
  // files are still being written; resolves when the import settles.
  inFlightImports: Set<Promise<void>>;
  // Runtime joint positions (ADR 0011 point 5): never saved, 0 when absent.
  jointPositions: Map<string, number>;
  // Setpoint tags (ADR 0012): last written value per joint, and the writes
  // the next simulation step has not consumed yet. Never saved.
  setpoints: Map<string, number>;
  queuedSetpoints: Map<string, number>;
  // Drives (ADR 0022), never saved: joint velocities, the last value written
  // to each drive command, each drive's state and feedback, and the faults.
  jointVelocities: Map<string, number>;
  driveCommands: Map<string, Readonly<Record<string, number>>>;
  driveStates: Map<string, Readonly<Record<string, number>>>;
  driveFeedback: Map<string, Readonly<Record<string, number>>>;
  // An unresponsive drive runs on the commands it had when it failed.
  frozenDriveCommands: Map<string, Readonly<Record<string, number>>>;
  jammedJointIds: Set<string>;
  // Simulation steps run since the Pantin was opened.
  stepCount: number;
};

export function meshPathsOf(document: PantinDocument): Set<string> {
  return new Set(document.bodies.map((body) => body.mesh));
}

// `document` is what pantin.json on disk contains.
export function newOpenPantin(document: PantinDocument): OpenPantin {
  return {
    document,
    savedText: serializePantinDocument(document),
    savedMeshPaths: meshPathsOf(document),
    writingMeshPaths: new Set(),
    pendingMeshDeletions: new Set(),
    saveQueue: Promise.resolve(),
    inFlightImports: new Set(),
    jointPositions: new Map(),
    setpoints: new Map(),
    queuedSetpoints: new Map(),
    jointVelocities: new Map(),
    driveCommands: new Map(),
    driveStates: new Map(),
    driveFeedback: new Map(),
    frozenDriveCommands: new Map(),
    jammedJointIds: new Set(),
    stepCount: 0,
  };
}

/** Back to the reference configuration: no motion, no command, no fault. */
export function resetRuntimeState(openPantin: OpenPantin): void {
  openPantin.jointPositions.clear();
  openPantin.setpoints.clear();
  openPantin.queuedSetpoints.clear();
  openPantin.jointVelocities.clear();
  openPantin.driveCommands.clear();
  openPantin.driveStates.clear();
  openPantin.driveFeedback.clear();
  openPantin.frozenDriveCommands.clear();
  openPantin.jammedJointIds.clear();
}
// Promises, not values: two requests loading the same Pantin at once share
// one load, hence one OpenPantin object that both edit.
export type ServiceContext = {
  store: PantinStore;
  openPantins: Map<PantinId, Promise<OpenPantin>>;
  // The same Pantins once loaded, for the simulation loop, which cannot wait.
  loadedPantins: Map<PantinId, OpenPantin>;
  // Undefined when the core was started without --step-converter-python.
  stepConverter: StepConverter | undefined;
};

export function toResponse(pantinId: PantinId, openPantin: OpenPantin): PantinResponse {
  const unsavedChanges = serializePantinDocument(openPantin.document) !== openPantin.savedText;
  return { id: pantinId, unsavedChanges, document: openPantin.document };
}

export function loadPantin(context: ServiceContext, pantinId: PantinId): Promise<OpenPantin> {
  const alreadyOpen = context.openPantins.get(pantinId);
  if (alreadyOpen !== undefined) {
    return alreadyOpen;
  }
  const loading = readPantinFromDisk(context, pantinId).then((openPantin) => {
    context.loadedPantins.set(pantinId, openPantin);
    return openPantin;
  });
  context.openPantins.set(pantinId, loading);
  // A failed load is not cached: the file may be fixed and read again.
  loading.catch(() => context.openPantins.delete(pantinId));
  return loading;
}

// Reads and validates pantin.json without opening the Pantin.
export async function readSavedDocument(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<PantinDocument> {
  const text = await context.store.readDocumentText(pantinId);
  if (text === undefined) {
    throw new ApiError(
      "not_found",
      `No Pantin with id "${pantinId}". List them with GET /api/pantins.`,
    );
  }
  const location = context.store.describeDocumentLocation(pantinId);
  return parsePantinDocument(text, location);
}

async function readPantinFromDisk(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<OpenPantin> {
  // Compared in canonical form, so a hand formatted file is not "unsaved".
  return newOpenPantin(await readSavedDocument(context, pantinId));
}

export async function updateDocument(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (document: PantinDocument) => PantinDocument,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.document = edit(openPantin.document);
  return toResponse(pantinId, openPantin);
}
