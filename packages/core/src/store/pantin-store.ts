import { randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  faceFilePathOf,
  MAX_FACE_FILE_BYTES,
  PANTIN_DOCUMENT_FILE_NAME,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinId,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { assertRealPathInside, isErrorWithCode, resolveInside } from "./safe-paths.ts";

// File system side of the Pantins: one folder per Pantin inside the pantins
// directory. Every path is checked twice (defence in depth, ids are already
// validated): lexically, then after following symbolic links.

export type MeshFile = { stream: ReadStream; sizeInBytes: number };

export type PantinStore = {
  listFolderNames(): Promise<string[]>;
  createPantinFolder(pantinId: PantinId): Promise<void>;
  readDocumentText(pantinId: PantinId): Promise<string | undefined>;
  // When pantin.json last changed on disk; undefined when there is none.
  readDocumentModifiedAt(pantinId: PantinId): Promise<Date | undefined>;
  writeDocumentAtomically(pantinId: PantinId, text: string): Promise<void>;
  listMeshFileNames(pantinId: PantinId): Promise<string[]>;
  writeMesh(pantinId: PantinId, meshPath: string, bytes: Uint8Array): Promise<void>;
  // The face file of a GLB mesh (ADR 0035), written after the mesh.
  writeFaceFile(pantinId: PantinId, meshPath: string, bytes: Uint8Array): Promise<void>;
  // The text of a GLB mesh's face file; undefined when it has none.
  readFaceFile(pantinId: PantinId, meshPath: string): Promise<string | undefined>;
  // Serves a mesh, or the face file of one: any file of the meshes folder.
  openMesh(pantinId: PantinId, meshPath: string): Promise<MeshFile>;
  // Deletes the mesh and its face file, if any.
  deleteMesh(pantinId: PantinId, meshPath: string): Promise<void>;
  describeDocumentLocation(pantinId: PantinId): string;
};

type Paths = { pantinsDirectory: string };

function pathInPantin(paths: Paths, pantinId: PantinId, relativePath: string): string {
  return resolveInside(resolveInside(paths.pantinsDirectory, pantinId), relativePath);
}

function meshesDirectory(paths: Paths, pantinId: PantinId): string {
  return pathInPantin(paths, pantinId, PANTIN_MESHES_DIRECTORY_NAME);
}

async function listFolderNames(paths: Paths): Promise<string[]> {
  const entries = await readdir(resolve(paths.pantinsDirectory), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function createPantinFolder(paths: Paths, pantinId: PantinId): Promise<void> {
  try {
    await mkdir(resolveInside(paths.pantinsDirectory, pantinId));
  } catch (error) {
    if (isErrorWithCode(error, "EEXIST")) {
      throw new ApiError("conflict", `A folder "${pantinId}" already exists. Retry the creation.`);
    }
    throw error;
  }
  await mkdir(meshesDirectory(paths, pantinId));
}

async function readDocumentText(paths: Paths, pantinId: PantinId): Promise<string | undefined> {
  const path = pathInPantin(paths, pantinId, PANTIN_DOCUMENT_FILE_NAME);
  try {
    await assertRealPathInside(paths.pantinsDirectory, path);
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

async function readDocumentModifiedAt(paths: Paths, pantinId: PantinId): Promise<Date | undefined> {
  const path = pathInPantin(paths, pantinId, PANTIN_DOCUMENT_FILE_NAME);
  try {
    await assertRealPathInside(paths.pantinsDirectory, path);
    // stat, not lstat: the date of the file the user edits, already checked to be inside.
    return (await stat(path)).mtime;
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

// Writes a temporary file in the same folder (so the rename stays on one file
// system), then renames it: readers never see a half written pantin.json.
async function writeDocumentAtomically(paths: Paths, pantinId: PantinId, text: string) {
  await assertRealPathInside(
    paths.pantinsDirectory,
    resolveInside(paths.pantinsDirectory, pantinId),
  );
  const temporaryName = `.${PANTIN_DOCUMENT_FILE_NAME}.${randomUUID()}.tmp`;
  const temporaryPath = pathInPantin(paths, pantinId, temporaryName);
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, pathInPantin(paths, pantinId, PANTIN_DOCUMENT_FILE_NAME));
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function listMeshFileNames(paths: Paths, pantinId: PantinId): Promise<string[]> {
  const directory = meshesDirectory(paths, pantinId);
  try {
    await assertRealPathInside(paths.pantinsDirectory, directory);
    return await readdir(directory);
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

// "wx": never overwrite an existing file, nor follow a symbolic link planted there.
async function writeMeshesFile(
  paths: Paths,
  pantinId: PantinId,
  relativePath: string,
  bytes: Uint8Array,
) {
  const directory = meshesDirectory(paths, pantinId);
  await mkdir(directory, { recursive: true });
  await assertRealPathInside(paths.pantinsDirectory, directory);
  try {
    await writeFile(pathInPantin(paths, pantinId, relativePath), bytes, { flag: "wx" });
  } catch (error) {
    if (isErrorWithCode(error, "EEXIST")) {
      throw new ApiError("conflict", `File "${relativePath}" already exists. Retry the import.`);
    }
    throw error;
  }
}

function requireFaceFilePath(meshPath: string): string {
  const faceFilePath = faceFilePathOf(meshPath);
  if (faceFilePath === undefined) {
    throw new Error(`Only a GLB mesh has a face file, not "${meshPath}".`);
  }
  return faceFilePath;
}

async function openMesh(paths: Paths, pantinId: PantinId, meshPath: string): Promise<MeshFile> {
  const path = pathInPantin(paths, pantinId, meshPath);
  const missing = new ApiError(
    "not_found",
    `Mesh file "${meshPath}" is missing. Re-import the body.`,
  );
  try {
    await assertRealPathInside(paths.pantinsDirectory, meshesDirectory(paths, pantinId));
    // lstat, not stat: a symbolic link is never served, wherever it points.
    const stats = await lstat(path);
    if (!stats.isFile()) {
      throw missing;
    }
    return { stream: createReadStream(path), sizeInBytes: stats.size };
  } catch (error) {
    throw isErrorWithCode(error, "ENOENT") ? missing : error;
  }
}

async function readFaceFile(
  paths: Paths,
  pantinId: PantinId,
  meshPath: string,
): Promise<string | undefined> {
  const faceFilePath = faceFilePathOf(meshPath);
  if (faceFilePath === undefined) {
    return undefined;
  }
  const path = pathInPantin(paths, pantinId, faceFilePath);
  try {
    await assertRealPathInside(paths.pantinsDirectory, meshesDirectory(paths, pantinId));
    // lstat: a symbolic link is never read, wherever it points.
    const stats = await lstat(path);
    if (!stats.isFile() || stats.size > MAX_FACE_FILE_BYTES) {
      return undefined;
    }
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

// Used to roll back a failed import; a missing file is not an error.
async function deleteMesh(paths: Paths, pantinId: PantinId, meshPath: string): Promise<void> {
  await assertRealPathInside(paths.pantinsDirectory, meshesDirectory(paths, pantinId));
  const faceFilePath = faceFilePathOf(meshPath);
  if (faceFilePath !== undefined) {
    await rm(pathInPantin(paths, pantinId, faceFilePath), { force: true });
  }
  await rm(pathInPantin(paths, pantinId, meshPath), { force: true });
}

export function createPantinStore(pantinsDirectory: string): PantinStore {
  const paths: Paths = { pantinsDirectory };
  return {
    listFolderNames: () => listFolderNames(paths),
    createPantinFolder: (pantinId) => createPantinFolder(paths, pantinId),
    readDocumentText: (pantinId) => readDocumentText(paths, pantinId),
    readDocumentModifiedAt: (pantinId) => readDocumentModifiedAt(paths, pantinId),
    writeDocumentAtomically: (pantinId, text) => writeDocumentAtomically(paths, pantinId, text),
    listMeshFileNames: (pantinId) => listMeshFileNames(paths, pantinId),
    writeMesh: (pantinId, meshPath, bytes) => writeMeshesFile(paths, pantinId, meshPath, bytes),
    writeFaceFile: (pantinId, meshPath, bytes) =>
      writeMeshesFile(paths, pantinId, requireFaceFilePath(meshPath), bytes),
    readFaceFile: (pantinId, meshPath) => readFaceFile(paths, pantinId, meshPath),
    openMesh: (pantinId, meshPath) => openMesh(paths, pantinId, meshPath),
    deleteMesh: (pantinId, meshPath) => deleteMesh(paths, pantinId, meshPath),
    // Relative to the pantins directory: error messages never reveal absolute paths.
    describeDocumentLocation: (pantinId) => join(pantinId, PANTIN_DOCUMENT_FILE_NAME),
  };
}
