import {
  type ExampleSummary,
  faceFilePathOf,
  IO_JSON_FILE_NAME,
  MeshFolderFileNameSchema,
  PANTIN_DOCUMENT_FILE_NAME,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinDocument,
  type PantinId,
  PantinIdSchema,
  type PantinResponse,
} from "@pantin/protocol";
import { makeUniqueId, slugifyDisplayName } from "../domain/ids.ts";
import { ioTextOf, readIoDocument } from "../domain/io-document-text.ts";
import {
  readValidDocument,
  renamePantinDocument,
  serializePantinDocument,
} from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { ExampleStore } from "../store/example-store.ts";
import { loadPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Example Pantins (ADR 0062): listed from a read-only folder, copied into the
// Pantins folder on demand. Nothing is opened in place.

// What a copy writes: the checked document and the files it references.
type ExampleContents = {
  document: PantinDocument;
  // Canonical text of io.json; undefined when the example has none.
  ioText: string | undefined;
  meshPaths: string[];
  // Only the face files that exist.
  faceFilePaths: string[];
};

function decodeText(bytes: Uint8Array, fileName: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError("conflict", `Example file "${fileName}" is not valid UTF-8.`);
  }
}

async function readExampleDocument(store: ExampleStore, exampleId: string) {
  const bytes = await store.readFile(exampleId, PANTIN_DOCUMENT_FILE_NAME);
  if (bytes === undefined) {
    throw new ApiError("conflict", `Example "${exampleId}" has no ${PANTIN_DOCUMENT_FILE_NAME}.`);
  }
  const text = decodeText(bytes, PANTIN_DOCUMENT_FILE_NAME);
  return readValidDocument(text, `${exampleId}/${PANTIN_DOCUMENT_FILE_NAME}`).document;
}

async function readExampleIoText(store: ExampleStore, exampleId: string) {
  const reading = readIoDocument(await store.readFile(exampleId, IO_JSON_FILE_NAME));
  if (reading.kind === "unreadable") {
    const problems = reading.problems.map((problem) => problem.message).join("; ");
    throw new ApiError("conflict", `Example "${exampleId}" has an invalid io.json: ${problems}`);
  }
  return ioTextOf(reading) ?? undefined;
}

// "meshes/<file name>" and nothing else: no `..`, no subfolder, no other extension.
function requireMeshPath(meshPath: string): void {
  const prefix = `${PANTIN_MESHES_DIRECTORY_NAME}/`;
  const fileName = meshPath.startsWith(prefix) ? meshPath.slice(prefix.length) : "";
  const isSafeName = MeshFolderFileNameSchema.safeParse(fileName).success;
  if (!isSafeName || !/\.(glb|stl)$/.test(fileName)) {
    throw new ApiError(
      "conflict",
      `Example mesh "${meshPath}" must be ${prefix}<file name> ending in .glb or .stl.`,
    );
  }
}

async function checkMeshFiles(store: ExampleStore, exampleId: string, document: PantinDocument) {
  const meshPaths = [...new Set(document.bodies.map((body) => body.mesh))];
  const faceFilePaths: string[] = [];
  for (const meshPath of meshPaths) {
    requireMeshPath(meshPath);
    if ((await store.statFile(exampleId, meshPath)) === undefined) {
      throw new ApiError("conflict", `Example mesh "${meshPath}" is missing.`);
    }
    const faceFilePath = faceFilePathOf(meshPath);
    if (
      faceFilePath !== undefined &&
      (await store.statFile(exampleId, faceFilePath)) !== undefined
    ) {
      faceFilePaths.push(faceFilePath);
    }
  }
  return { meshPaths, faceFilePaths };
}

// Every check of ADR 0062 point 2; throws an ApiError that says which one failed.
async function inspectExample(store: ExampleStore, exampleId: string): Promise<ExampleContents> {
  const document = await readExampleDocument(store, exampleId);
  const ioText = await readExampleIoText(store, exampleId);
  return { document, ioText, ...(await checkMeshFiles(store, exampleId, document)) };
}

function reportLeftOut(
  context: ServiceContext,
  store: ExampleStore,
  folderName: string,
  error: unknown,
): void {
  if (!(error instanceof ApiError)) {
    throw error;
  }
  if (!store.isFirstReport(`${folderName}: ${error.message}`)) {
    return;
  }
  context.reportError(new Error(`Example "${folderName}" left out of the list: ${error.message}`));
}

async function listExamples(context: ServiceContext): Promise<ExampleSummary[]> {
  const store = context.exampleStore;
  if (store === undefined) {
    return [];
  }
  const summaries: ExampleSummary[] = [];
  for (const folderName of (await store.listFolderNames()).sort()) {
    const idResult = PantinIdSchema.safeParse(folderName);
    try {
      if (!idResult.success) {
        throw new ApiError("invalid_request", "its folder name is not a valid id");
      }
      const { document } = await inspectExample(store, idResult.data);
      summaries.push({
        id: idResult.data,
        name: document.name,
        bodyCount: document.bodies.length,
      });
    } catch (error) {
      reportLeftOut(context, store, folderName, error);
    }
  }
  return summaries;
}

async function inspectForCopy(context: ServiceContext, exampleId: string) {
  const store = context.exampleStore;
  if (store === undefined) {
    throw new ApiError(
      "not_found",
      "This core has no examples: it was started without --examples-dir.",
    );
  }
  try {
    return { store, contents: await inspectExample(store, exampleId) };
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(
        "not_found",
        `Example "${exampleId}" is not available (${error.message}). List them with GET /api/examples.`,
      );
    }
    throw error;
  }
}

async function readExampleFile(store: ExampleStore, exampleId: string, relativePath: string) {
  const bytes = await store.readFile(exampleId, relativePath);
  if (bytes === undefined) {
    throw new ApiError("conflict", `Example file "${relativePath}" disappeared during the copy.`);
  }
  return bytes;
}

// Allowlist, in this order: meshes, face files, io.json, then pantin.json last,
// so that a copy that stops halfway has no pantin.json and is never listed.
async function writeCopy(
  context: ServiceContext,
  source: { store: ExampleStore; exampleId: string; contents: ExampleContents },
  pantinId: PantinId,
  name: string,
): Promise<void> {
  const { store, exampleId, contents } = source;
  for (const meshPath of contents.meshPaths) {
    const bytes = await readExampleFile(store, exampleId, meshPath);
    await context.store.writeMesh(pantinId, meshPath, bytes);
  }
  for (const faceFilePath of contents.faceFilePaths) {
    const bytes = await readExampleFile(store, exampleId, faceFilePath);
    // The face file belongs to the mesh it was derived from.
    const meshPath = contents.meshPaths.find((path) => faceFilePathOf(path) === faceFilePath);
    await context.store.writeFaceFile(pantinId, meshPath ?? faceFilePath, bytes);
  }
  if (contents.ioText !== undefined) {
    await context.store.writeIoAtomically(pantinId, contents.ioText);
  }
  const document = renamePantinDocument(contents.document, name);
  await context.store.writeDocumentAtomically(pantinId, serializePantinDocument(document));
}

async function copyExample(
  context: ServiceContext,
  exampleId: string,
  requestedName: string | undefined,
): Promise<PantinResponse> {
  const { store, contents } = await inspectForCopy(context, exampleId);
  const name = requestedName ?? contents.document.name;
  const takenIds = new Set([
    ...(await context.store.listFolderNames()),
    ...context.openPantins.keys(),
  ]);
  const pantinId = makeUniqueId(slugifyDisplayName(name, "pantin"), takenIds);
  // Throws "conflict" when the folder exists: nothing was created, so nothing is removed.
  await context.store.createPantinFolder(pantinId);
  try {
    await writeCopy(context, { store, exampleId, contents }, pantinId, name);
    return toResponse(pantinId, await loadPantin(context, pantinId));
  } catch (error) {
    // Only the folder this request created.
    await context.store.removeCreatedPantinFolder(pantinId);
    throw error;
  }
}

export function exampleOperations(context: ServiceContext) {
  return {
    listExamples: () => listExamples(context),
    copyExample: (exampleId: string, name: string | undefined) =>
      copyExample(context, exampleId, name),
  };
}
