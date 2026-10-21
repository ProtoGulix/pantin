import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { ApiError } from "../errors.ts";
import { isErrorWithCode, resolveInside } from "./safe-paths.ts";

// Read-only side of the examples folder (ADR 0062). Examples are not trusted
// like the user's own Pantins: a file is read only when it is a regular file
// (never a link), really sits at its place inside the example's folder, and is
// not larger than `maxFileBytes`.

export type ExampleStore = {
  listFolderNames(): Promise<string[]>;
  // The size of a checked file; undefined when it does not exist. Throws an
  // ApiError that names the file when a check fails.
  statFile(exampleId: string, relativePath: string): Promise<number | undefined>;
  // The bytes of a file after the same checks; undefined when it does not exist.
  readFile(exampleId: string, relativePath: string): Promise<Uint8Array | undefined>;
  // True the first time it is asked about a key, false after: a log line is
  // written once per example and reason, not at every listing.
  isFirstReport(key: string): boolean;
};

type CheckedFile = { path: string; sizeInBytes: number; deviceId: number; inode: number };

function refusal(relativePath: string, reason: string): ApiError {
  return new ApiError("conflict", `Example file "${relativePath}" ${reason}.`);
}

// The example folder itself must be a real folder of the examples directory: a
// link to elsewhere is never read, whatever its files are. Returns its real path.
async function checkedFolder(
  examplesDirectory: string,
  folder: string,
  exampleId: string,
): Promise<string> {
  if (!(await lstat(folder)).isDirectory()) {
    throw new ApiError(
      "conflict",
      `Example "${exampleId}" is not a real folder (a link is refused).`,
    );
  }
  const realFolder = await realpath(folder);
  if (realFolder !== join(await realpath(examplesDirectory), exampleId)) {
    throw new ApiError("conflict", `Example "${exampleId}" leads outside the examples folder.`);
  }
  return realFolder;
}

// realpath of the folder, then of the file: the file must be exactly where its
// relative path says, so a linked subfolder is refused as well as a linked file.
async function checkedFile(
  examplesDirectory: string,
  exampleId: string,
  relativePath: string,
  maxFileBytes: number,
): Promise<CheckedFile | undefined> {
  const folder = resolveInside(examplesDirectory, exampleId);
  const path = resolveInside(folder, relativePath);
  try {
    const realFolder = await checkedFolder(examplesDirectory, folder, exampleId);
    const stats = await lstat(path);
    if (!stats.isFile()) {
      throw refusal(relativePath, "is not a regular file (a link or a folder is refused)");
    }
    if (stats.size > maxFileBytes) {
      throw refusal(relativePath, `is larger than ${maxFileBytes} bytes`);
    }
    if ((await realpath(path)) !== join(realFolder, relativePath)) {
      throw refusal(relativePath, "leads outside its example folder");
    }
    return { path, sizeInBytes: stats.size, deviceId: stats.dev, inode: stats.ino };
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

// O_NOFOLLOW: a link swapped in after the checks is refused by the system.
async function readWithoutFollowing(file: CheckedFile): Promise<Uint8Array> {
  const handle = await open(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (opened.dev !== file.deviceId || opened.ino !== file.inode) {
      throw new ApiError("conflict", "An example file was replaced while it was being read.");
    }
    // One byte more than checked: a file that grew since is recognisable.
    const buffer = new Uint8Array(file.sizeInBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== file.sizeInBytes) {
      throw new ApiError("conflict", "An example file changed while it was being read.");
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function createExampleStore(examplesDirectory: string, maxFileBytes: number): ExampleStore {
  const reportedKeys = new Set<string>();
  return {
    isFirstReport: (key) => {
      const isFirst = !reportedKeys.has(key);
      reportedKeys.add(key);
      return isFirst;
    },
    listFolderNames: async () => {
      const entries = await readdir(examplesDirectory, { withFileTypes: true });
      // A link to a folder is not isDirectory() here, so it is never listed.
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    },
    statFile: async (exampleId, relativePath) =>
      (await checkedFile(examplesDirectory, exampleId, relativePath, maxFileBytes))?.sizeInBytes,
    readFile: async (exampleId, relativePath) => {
      const file = await checkedFile(examplesDirectory, exampleId, relativePath, maxFileBytes);
      return file === undefined ? undefined : readWithoutFollowing(file);
    },
  };
}
