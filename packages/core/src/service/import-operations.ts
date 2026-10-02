import type {
  Assembly,
  Body,
  ConsoleEvent,
  FaceFile,
  ImportBodyQuery,
  Joint,
  PantinId,
} from "@pantin/protocol";
import { stepConverterUnavailable } from "../converter/step-converter.ts";
import { newAssembly } from "../domain/assemblies.ts";
import { fileNameStem } from "../domain/ids.ts";
import {
  buildImportedBody,
  detectImportFormat,
  toDisplayName,
  unsupportedFileError,
} from "../domain/import-body.ts";
import { addStarJoints } from "../domain/import-joints.ts";
import {
  addAssembly,
  addBodies,
  removeAssembly,
  removeBodies,
  removeJoints,
} from "../domain/pantin-document.ts";
import { buildStepBodies, stepAssemblyName } from "../domain/step-bodies.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import { releaseMesh } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Import of one uploaded file: one body for GLB and STL, one body per
// assembly component for STEP, joined by fixed joints (ADR 0017), all in one
// new assembly (ADR 0019). All or nothing: on any failure, the joints, the
// bodies then the assembly of this import leave the document and their mesh
// files are deleted. A STEP body keeps its face file next to its mesh
// (ADR 0035 point 2); one without is reported in the console.

// `faceFile` is null for a STEP body whose face map the converter could not
// prove, undefined for GLB and STL bodies, which never have one.
type PlannedMesh = { body: Body; bytes: Uint8Array; faceFile?: FaceFile | null };

export type ImportedBodies = { bodies: Body[]; joints: Joint[] };

async function takenMeshStems(context: ServiceContext, pantinId: PantinId): Promise<string[]> {
  return (await context.store.listMeshFileNames(pantinId)).map(fileNameStem);
}

async function writeAllOrNothing(
  context: ServiceContext,
  pantinId: PantinId,
  { openPantin, assembly, planned, joints }: Reservation,
): Promise<ImportedBodies> {
  const written: string[] = [];
  try {
    for (const { body, bytes, faceFile } of planned) {
      // Exclusive creation: an existing file is never overwritten.
      await context.store.writeMesh(pantinId, body.mesh, bytes);
      written.push(body.mesh);
      // No rollback entry of its own: deleting the mesh deletes its face file too.
      if (faceFile !== undefined && faceFile !== null) {
        const faceFileBytes = new TextEncoder().encode(JSON.stringify(faceFile));
        await context.store.writeFaceFile(pantinId, body.mesh, faceFileBytes);
      }
    }
  } catch (error) {
    // Joints first, so that no joint ever points to a missing body.
    const jointIds = new Set(joints.map((joint) => joint.id));
    openPantin.document = removeJoints(openPantin.document, jointIds);
    for (const jointId of jointIds) {
      forgetJointRuntimeState(openPantin, jointId);
    }
    const plannedIds = new Set(planned.map(({ body }) => body.id));
    openPantin.document = removeBodies(openPantin.document, plannedIds);
    openPantin.document = removeAssembly(openPantin.document, assembly.key);
    for (const meshPath of written) {
      await releaseMesh(context, pantinId, openPantin, meshPath);
    }
    throw error;
  }
  return { bodies: planned.map(({ body }) => body), joints };
}

type Reservation = {
  openPantin: OpenPantin;
  assembly: Assembly;
  planned: PlannedMesh[];
  joints: Joint[];
  settle: () => void;
};

// The ids and keys are reserved synchronously (no await between building the
// assembly and the bodies and adding them with their joints), so a concurrent
// import or joint creation cannot pick the same ones. The import is
// registered in the same step, so a save waits for its meshes; `settle` must
// be called once the meshes are written or rolled back.
function reserve(openPantin: OpenPantin, assembly: Assembly, planned: PlannedMesh[]): Reservation {
  const bodies = planned.map(({ body }) => body);
  const withBodies = addBodies(addAssembly(openPantin.document, assembly), bodies);
  const { document, joints } = addStarJoints(withBodies, bodies);
  openPantin.document = document;
  let resolveImport = (): void => undefined;
  const inFlight = new Promise<void>((resolve) => {
    resolveImport = resolve;
  });
  openPantin.inFlightImports.add(inFlight);
  const settle = (): void => {
    openPantin.inFlightImports.delete(inFlight);
    resolveImport();
  };
  return { openPantin, assembly, planned, joints, settle };
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
  const { document } = openPantin;
  const assembly = newAssembly(document, stepAssemblyName(query, meshes));
  const planned = buildStepBodies(document, query, meshes, stems, assembly.key).map(
    ({ body, component }) => ({
      body,
      bytes: component.glbBytes,
      faceFile: component.faceFile ?? null,
    }),
  );
  return reserve(openPantin, assembly, planned);
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
  const { document } = openPantin;
  const assembly = newAssembly(document, toDisplayName(fileNameStem(query.fileName), "Assembly"));
  const body = buildImportedBody(document, query, format, bytes, stems, assembly.key);
  return reserve(openPantin, assembly, [{ body, bytes }]);
}

export async function importBodies(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Promise<ImportedBodies> {
  const format = detectImportFormat(bytes);
  if (format === undefined) {
    throw unsupportedFileError(query.fileName);
  }
  const reservation =
    format === "step"
      ? await planStepImport(context, pantinId, query, bytes)
      : await planDirectImport(context, pantinId, query, bytes, format);
  // The meshes are written now; the bodies join pantin.json on the next save.
  try {
    const imported = await writeAllOrNothing(context, pantinId, reservation);
    recordConsoleEvents(context, reservation.openPantin, missingFaceFileEvents(reservation));
    return imported;
  } finally {
    reservation.settle();
  }
}

function missingFaceFileEvents({ planned }: Reservation): ConsoleEvent[] {
  return planned
    .filter(({ faceFile }) => faceFile === null)
    .map(({ body }) => ({
      code: "face_file_missing",
      level: "warning",
      source: { kind: "body", id: body.id },
      params: {},
    }));
}
