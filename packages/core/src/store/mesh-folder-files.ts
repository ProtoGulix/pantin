import { lstat, readdir, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  type MeshFolderFileName,
  type OrphanMeshFile,
  PANTIN_MESHES_DIRECTORY_NAME,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { assertRealPathInside, isErrorWithCode, resolveInside } from "./safe-paths.ts";

// The meshes folder as a flat list of regular files (ADR 0038). `pantinFolder`
// is the folder of one Pantin, `pantinsDirectory` the base it must stay in.

// Neither the Pantin folder nor meshes/ may be a symbolic link, and meshes/ must
// really be this Pantin's own: a link to another Pantin's meshes/ stays inside
// the pantins directory but would make the cleanup delete that Pantin's files.
// Rejects with ENOENT when a folder is missing.
async function checkedMeshesDirectory(
  pantinsDirectory: string,
  pantinFolder: string,
): Promise<string> {
  const directory = join(pantinFolder, PANTIN_MESHES_DIRECTORY_NAME);
  for (const folder of [pantinFolder, directory]) {
    if ((await lstat(folder)).isSymbolicLink()) {
      throw new ApiError(
        "invalid_request",
        "A symbolic link replaces a Pantin folder or its meshes folder. Replace it with a real folder.",
      );
    }
  }
  await assertRealPathInside(pantinsDirectory, directory);
  if (
    (await realpath(directory)) !== join(await realpath(pantinFolder), PANTIN_MESHES_DIRECTORY_NAME)
  ) {
    throw new ApiError("invalid_request", "The meshes folder is not this Pantin's own folder.");
  }
  return directory;
}

export async function listMeshFolderFiles(
  pantinsDirectory: string,
  pantinFolder: string,
): Promise<OrphanMeshFile[]> {
  let directory: string;
  let names: string[];
  try {
    directory = await checkedMeshesDirectory(pantinsDirectory, pantinFolder);
    names = await readdir(directory);
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
  const files: OrphanMeshFile[] = [];
  for (const fileName of names) {
    try {
      const stats = await lstat(resolveInside(directory, fileName));
      if (stats.isFile()) {
        files.push({ fileName, sizeInBytes: stats.size });
      }
    } catch (error) {
      // Removed since the listing: nothing to report.
      if (!isErrorWithCode(error, "ENOENT")) {
        throw error;
      }
    }
  }
  return files;
}

// `mayDelete` is asked synchronously right before the unlink, after every
// await of the checks: a file it refuses is left alone and answers "kept".
export async function deleteMeshFolderFile(
  pantinsDirectory: string,
  pantinFolder: string,
  fileName: MeshFolderFileName,
  mayDelete: () => boolean,
): Promise<"deleted" | "missing" | "not_a_file" | "kept"> {
  try {
    const directory = await checkedMeshesDirectory(pantinsDirectory, pantinFolder);
    const path = resolveInside(directory, fileName);
    // lstat then unlink: a link is reported, never followed nor removed.
    if (!(await lstat(path)).isFile()) {
      return "not_a_file";
    }
    if (!mayDelete()) {
      return "kept";
    }
    await unlink(path);
    return "deleted";
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return "missing";
    }
    throw error;
  }
}
