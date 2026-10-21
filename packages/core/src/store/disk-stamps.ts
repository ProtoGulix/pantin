import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { type DiskStamp, type FileStat, MISSING_STAMP, stampOf } from "../domain/disk-stamp.ts";
import { ApiError } from "../errors.ts";
import { assertRealPathInside, isErrorWithCode } from "./safe-paths.ts";

// The disk side of ADR 0063: the stat and the stamp of one file of a Pantin
// folder. A missing file is a value, not an error. `confinedTo` is the
// directory a link may not leave: the pantins directory for pantin.json, the
// Pantin folder for io.json, as the readers of those files do.

export async function statFolderFile(
  confinedTo: string,
  folder: string,
  fileName: string,
): Promise<FileStat> {
  const path = join(folder, fileName);
  try {
    await assertRealPathInside(confinedTo, path);
    // stat follows a link that the line above just proved to stay inside.
    const stats = await stat(path);
    // Anything but a regular file (io.json made a folder) cannot be read as the
    // file: as good as missing, the mapping reports it on its own.
    return stats.isFile()
      ? { kind: "present", size: stats.size, mtimeMs: stats.mtimeMs }
      : { kind: "missing" };
  } catch (error) {
    // A link leading outside the folder is never read (the mapping reports it
    // as unreadable): there is nothing of ours to watch.
    if (isErrorWithCode(error, "ENOENT") || error instanceof ApiError) {
      return { kind: "missing" };
    }
    throw error;
  }
}

// Streamed, so that a huge file costs no memory. The stat is taken before the
// bytes: a write in between leaves an older mtime, which the next check reads
// again, never the reverse.
export async function readFolderFileStamp(
  confinedTo: string,
  folder: string,
  fileName: string,
): Promise<DiskStamp> {
  const fileStat = await statFolderFile(confinedTo, folder, fileName);
  if (fileStat.kind === "missing") {
    return MISSING_STAMP;
  }
  const hash = createHash("sha256");
  try {
    await pipeline(createReadStream(join(folder, fileName)), hash);
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return MISSING_STAMP;
    }
    throw error;
  }
  return stampOf(fileStat, hash.digest("hex"));
}
