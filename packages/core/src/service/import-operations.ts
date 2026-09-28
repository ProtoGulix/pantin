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
    await Promise.all(written.map((meshPath) => context.store.deleteMesh(pantinId, meshPath)));
    throw error;
  }
  return planned.map(({ body }) => body);
}

// The ids are reserved synchronously (no await between building the bodies
// and adding them), so a concurrent import cannot pick the same ones.
function reserve(openPantin: OpenPantin, planned: readonly PlannedMesh[]): void {
  openPantin.document = addBodies(
    openPantin.document,
    planned.map(({ body }) => body),
  );
}

async function planStepImport(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Promise<{ openPantin: OpenPantin; planned: PlannedMesh[] }> {
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
  reserve(openPantin, planned);
  return { openPantin, planned };
}

async function planDirectImport(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
  format: "glb" | "stl",
): Promise<{ openPantin: OpenPantin; planned: PlannedMesh[] }> {
  const openPantin = await loadPantin(context, pantinId);
  const stems = await takenMeshStems(context, pantinId);
  const body = buildImportedBody(openPantin.document, query, format, bytes, stems);
  const planned = [{ body, bytes }];
  reserve(openPantin, planned);
  return { openPantin, planned };
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
  const { openPantin, planned } =
    format === "step"
      ? await planStepImport(context, pantinId, query, bytes)
      : await planDirectImport(context, pantinId, query, bytes, format);
  // The meshes are written now; the bodies join pantin.json on the next save.
  return writeAllOrNothing(context, pantinId, openPantin, planned);
}
