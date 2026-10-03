import { posix } from "node:path";
import {
  FACE_FILE_EXTENSION,
  type OrphanMeshFile,
  type OrphanMeshList,
  PANTIN_MESHES_DIRECTORY_NAME,
} from "@pantin/protocol";

// Which files of the meshes folder no body uses (ADR 0038 point 1).

const MESH_FILE_EXTENSIONS = [".glb", ".stl", FACE_FILE_EXTENSION];

function isMeshFileName(fileName: string): boolean {
  const lowerCased = fileName.toLowerCase();
  return MESH_FILE_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}

// The lower-cased names of the meshes files that `meshPaths` use, as a mesh or
// as the face file of a GLB mesh. The store resolves a body path against the
// Pantin folder (absolute paths included), so any spelling of it can reach a
// meshes file: `./meshes/../meshes/x.glb`, `../<thisPantin>/meshes/x.glb`, an
// absolute path, `Meshes\\x.glb`. This rule may only ever keep more: after `\`
// becomes `/` and the path is normalised, any file whose folder is named
// "meshes" (ignoring case) is kept, wherever that folder is, which also keeps
// the file of another Pantin's meshes folder. Never deleting a used file
// matters more than listing every orphan.
export function keptMeshFileNames(meshPaths: Iterable<string>): Set<string> {
  const kept = new Set<string>();
  for (const meshPath of meshPaths) {
    const resolved = posix.resolve("/pantin", meshPath.replaceAll("\\", "/"));
    if (posix.basename(posix.dirname(resolved)).toLowerCase() !== PANTIN_MESHES_DIRECTORY_NAME) {
      continue;
    }
    const fileName = posix.basename(resolved).toLowerCase();
    kept.add(fileName);
    if (fileName.endsWith(".glb")) {
      kept.add(`${fileName.slice(0, -".glb".length)}${FACE_FILE_EXTENSION}`);
    }
  }
  return kept;
}

/** True when `fileName` is a mesh file that `kept` (see keptMeshFileNames) does not cover. */
export function isOrphanCandidate(fileName: string, kept: ReadonlySet<string>): boolean {
  return isMeshFileName(fileName) && !kept.has(fileName.toLowerCase());
}

function byFileName(first: OrphanMeshFile, second: OrphanMeshFile): number {
  if (first.fileName === second.fileName) {
    return 0;
  }
  return first.fileName < second.fileName ? -1 : 1;
}

export function findOrphanMeshFiles(
  files: readonly OrphanMeshFile[],
  meshPathsToKeep: Iterable<string>,
): OrphanMeshList {
  const kept = keptMeshFileNames(meshPathsToKeep);
  const orphans = files
    .filter(({ fileName }) => isOrphanCandidate(fileName, kept))
    .sort(byFileName);
  const totalSizeInBytes = orphans.reduce((total, { sizeInBytes }) => total + sizeInBytes, 0);
  return { files: orphans, totalSizeInBytes };
}
