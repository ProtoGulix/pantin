import type { Body, ImportBodyQuery, PantinId } from "@pantin/protocol";
import { stepConverterUnavailable } from "../converter/step-converter.ts";
import { fileNameStem } from "../domain/ids.ts";
import {
  buildImportedBody,
  detectImportFormat,
  unsupportedFileError,
} from "../domain/import-body.ts";
import { addBodies, removeBodies } from "../domain/pantin-document.ts";
import { buildStepBodies } from "../domain/step-bodies.ts";
import { releaseMesh } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Import of one uploaded file: one body for GLB and STL, one body per
// assembly component for STEP. All or nothing: on any failure, the bodies of
// this import leave the document and their mesh files are deleted.

type PlannedMesh = { body: Body; bytes: Uint8Array };

async function takenMeshStems(context: ServiceContext, pantinId: PantinId): Promise<string[]> {
  return (await context.store.listMeshFileNames(pantinId)).map(fileNameStem);
}

async function writeAllOrNothing(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
  planned: readonly PlannedMesh[],
): Promise<Body[]> {
  const written: string[] = [];
  try {
    for (const { body, bytes } of planned) {
      // Exclusive creation: an existing file is never overwritten.
      await context.store.writeMesh(pantinId, body.mesh, bytes);
      written.push(body.mesh);
    }
  } catch (error) {
    const plannedIds = new Set(planned.map(({ body }) => body.id));
    openPantin.document = removeBodies(openPantin.document, plannedIds);
    for (const meshPath of written) {
      await releaseMesh(context, pantinId, openPantin, meshPath);
    }
    throw error;
  }
  return planned.map(({ body }) => body);
}

type Reservation = { openPantin: OpenPantin; planned: PlannedMesh[]; settle: () => void };

// The ids are reserved synchronously (no await between building the bodies
// and adding them), so a concurrent import cannot pick the same ones. The
// import is registered in the same step, so a save waits for its meshes;
// `settle` must be called once the meshes are written or rolled back.
function reserve(openPantin: OpenPantin, planned: PlannedMesh[]): Reservation {
  openPantin.document = addBodies(
    openPantin.document,
    planned.map(({ body }) => body),
  );
  let resolveImport = (): void => undefined;
  const inFlight = new Promise<void>((resolve) => {
    resolveImport = resolve;
  });
  openPantin.inFlightImports.add(inFlight);
  const settle = (): void => {
    openPantin.inFlightImports.delete(inFlight);
    resolveImport();
  };
  return { openPantin, planned, settle };
}

async function planStepImport(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Promise<Reservation> {
  if (context.stepConverter === undefined) {
    throw stepConverterUnavailable();
  }
  await loadPantin(context, pantinId); // fail fast on an unknown Pantin
  const meshes = await context.stepConverter(bytes);
  const openPantin = await loadPantin(context, pantinId);
  const stems = await takenMeshStems(context, pantinId);
  const planned = buildStepBodies(openPantin.document, query, meshes, stems).map(
    ({ body, component }) => ({ body, bytes: component.glbBytes }),
  );
  return reserve(openPantin, planned);
}

async function planDirectImport(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
  format: "glb" | "stl",
): Promise<Reservation> {
  const openPantin = await loadPantin(context, pantinId);
  const stems = await takenMeshStems(context, pantinId);
  const body = buildImportedBody(openPantin.document, query, format, bytes, stems);
  const planned = [{ body, bytes }];
  return reserve(openPantin, planned);
}

export async function importBodies(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Promise<Body[]> {
  const format = detectImportFormat(bytes);
  if (format === undefined) {
    throw unsupportedFileError(query.fileName);
  }
  const { openPantin, planned, settle } =
    format === "step"
      ? await planStepImport(context, pantinId, query, bytes)
      : await planDirectImport(context, pantinId, query, bytes, format);
  // The meshes are written now; the bodies join pantin.json on the next save.
  try {
    return await writeAllOrNothing(context, pantinId, openPantin, planned);
  } finally {
    settle();
  }
}
