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
import { newAssembly, newAssemblyTree } from "../domain/assemblies.ts";
import {
  applyImportFrames,
  type ImportFrame,
  planImportFrames,
} from "../domain/assembly-frames.ts";
import { fileNameStem } from "../domain/ids.ts";
import {
  buildImportedBody,
  detectImportFormat,
  toDisplayName,
  unsupportedFileError,
} from "../domain/import-body.ts";
import { addFixedJoints } from "../domain/import-joints.ts";
import { addAssembly, addBodies } from "../domain/pantin-document.ts";
import {
  type PlannedAssembly,
  type PlannedLink,
  planStepTree,
} from "../domain/step-assembly-tree.ts";
import { buildStepBodies } from "../domain/step-bodies.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { isExistingFileConflict, rollbackImport } from "./import-rollback.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Import of one uploaded file: one body for GLB and STL, one body per
// assembly component for STEP, joined by fixed joints (ADR 0017), in one new
// assembly (ADR 0019) or, for STEP, in the tree of assemblies the file holds
// (ADR 0040). All or nothing: on any failure, the joints, the bodies then the
// assemblies of this import (deepest first) leave the document and their
// mesh files are deleted. A STEP body keeps its face file next to its mesh
// (ADR 0035 point 2); one without is reported in the console.

// `faceFile` is null for a STEP body whose face map the converter could not
// prove, undefined for GLB and STL bodies, which never have one.
type PlannedMesh = { body: Body; bytes: Uint8Array; faceFile?: FaceFile | null };

// `assemblies` lists the assemblies created, top level first.
export type ImportedBodies = { assemblies: Assembly[]; bodies: Body[]; joints: Joint[] };

async function takenMeshStems(context: ServiceContext, pantinId: PantinId): Promise<string[]> {
  return (await context.store.listMeshFileNames(pantinId)).map(fileNameStem);
}

async function writeAllOrNothing(
  context: ServiceContext,
  pantinId: PantinId,
  { openPantin, assemblies, planned, joints }: Reservation,
): Promise<ImportedBodies> {
  const written: string[] = [];
  let attempted: string | undefined;
  let foreignFaceFileOf: string | undefined;
  try {
    for (const { body, bytes, faceFile } of planned) {
      attempted = body.mesh;
      // Exclusive creation: an existing file is never overwritten.
      await context.store.writeMesh(pantinId, body.mesh, bytes);
      written.push(body.mesh);
      attempted = undefined;
      // No rollback entry of its own: deleting the mesh deletes its face file too.
      if (faceFile !== undefined && faceFile !== null) {
        const faceFileBytes = new TextEncoder().encode(JSON.stringify(faceFile));
        try {
          await context.store.writeFaceFile(pantinId, body.mesh, faceFileBytes);
        } catch (error) {
          // The face file was already there: it is not ours to delete.
          foreignFaceFileOf = isExistingFileConflict(error) ? body.mesh : undefined;
          throw error;
        }
      }
    }
  } catch (error) {
    // A write that failed half way leaves a partial file, unless the file was
    // already there and the exclusive creation refused it: that one is not ours.
    const halfWritten = attempted === undefined || isExistingFileConflict(error) ? [] : [attempted];
    const bodyIds = new Set(planned.map(({ body }) => body.id));
    await rollbackImport(
      context,
      pantinId,
      { openPantin, assemblies, bodyIds, joints },
      [...written, ...halfWritten],
      foreignFaceFileOf,
    );
    throw error;
  }
  return { assemblies, bodies: planned.map(({ body }) => body), joints };
}

type Reservation = {
  openPantin: OpenPantin;
  assemblies: Assembly[];
  planned: PlannedMesh[];
  joints: Joint[];
  settle: () => void;
};

// The ids and keys are reserved synchronously (no await between building the
// assemblies and the bodies and adding them with their joints), so a concurrent
// import or joint creation cannot pick the same ones. The import is
// registered in the same step, so a save waits for its meshes; `settle` must
// be called once the meshes are written or rolled back.
function reserve(
  openPantin: OpenPantin,
  assemblies: Assembly[],
  planned: PlannedMesh[],
  links: readonly PlannedLink[] = [],
  frames: readonly ImportFrame[] = [],
): Reservation {
  const bodies = planned.map(({ body }) => body);
  const withAssemblies = assemblies.reduce(addAssembly, openPantin.document);
  const withBodies = addBodies(withAssemblies, bodies);
  const bodyLinks = links.flatMap(({ parent, child }) => {
    const [parentBody, childBody] = [bodies[parent], bodies[child]];
    return parentBody === undefined || childBody === undefined
      ? []
      : [{ parent: parentBody, child: childBody }];
  });
  const withJoints = addFixedJoints(withBodies, bodyLinks);
  const placed = applyImportFrames(withJoints.document, assemblies, bodies, frames);
  const { joints } = withJoints;
  openPantin.document = placed.document;
  let resolveImport = (): void => undefined;
  const inFlight = new Promise<void>((resolve) => {
    resolveImport = resolve;
  });
  openPantin.inFlightImports.add(inFlight);
  const settle = (): void => {
    openPantin.inFlightImports.delete(inFlight);
    resolveImport();
  };
  return {
    openPantin,
    assemblies: placed.assemblies,
    planned: planned.map((mesh, at) => ({ ...mesh, body: placed.bodies[at] ?? mesh.body })),
    joints,
    settle,
  };
}

// The key of the assembly of each component, by component index.
function assemblyKeysOf(
  assemblies: readonly Assembly[],
  plan: readonly PlannedAssembly[],
): string[] {
  const keys: string[] = [];
  plan.forEach(({ components }, at) => {
    for (const component of components) {
      const assembly = assemblies[at];
      if (assembly === undefined) {
        throw new Error(`Planned assembly ${at} has no created assembly.`);
      }
      keys[component] = assembly.key;
    }
  });
  return keys;
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
  const { components: meshes, assemblyNodes } = await context.stepConverter(bytes);
  const openPantin = await loadPantin(context, pantinId);
  const stems = await takenMeshStems(context, pantinId);
  const { document } = openPantin;
  const { assemblies: plan, links } = planStepTree(meshes, fileNameStem(query.fileName));
  const assemblies = newAssemblyTree(document, plan);
  const frames = planImportFrames(plan, links, assemblyNodes);
  const planned = buildStepBodies(
    document,
    query,
    meshes,
    stems,
    assemblyKeysOf(assemblies, plan),
  ).map(({ body, component }) => ({
    body,
    bytes: component.glbBytes,
    faceFile: component.faceFile ?? null,
  }));
  return reserve(openPantin, assemblies, planned, links, frames);
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
  return reserve(openPantin, [assembly], [{ body, bytes }]);
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
