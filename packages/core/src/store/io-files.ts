import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { IO_FILE_MAX_BYTES, IO_JSON_FILE_NAME } from "@pantin/protocol";
import { writeTextAtomically } from "./atomic-write.ts";
import { readFileUpTo } from "./bounded-read.ts";
import { assertRealPathInside, isErrorWithCode } from "./safe-paths.ts";

// The mapping files of one Pantin folder (ADR 0049 points 3 and 8).

// The pair io.json replaced: the core never reads them, it only notices them.
const LEGACY_FILE_NAMES = ["io.csv", "io-modules.json"] as const;

/**
 * The bytes of io.json: at most IO_FILE_MAX_BYTES + 1 of them, so that a
 * larger file is recognisable; undefined when it does not exist.
 */
export async function readIoJson(folder: string): Promise<Uint8Array | undefined> {
  const path = join(folder, IO_JSON_FILE_NAME);
  try {
    // Inside this Pantin's folder: a link to a sibling Pantin's file is refused.
    await assertRealPathInside(folder, path);
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
  return readFileUpTo(path, IO_FILE_MAX_BYTES);
}

export async function writeIoJson(
  pantinsDirectory: string,
  folder: string,
  text: string,
): Promise<void> {
  await assertRealPathInside(pantinsDirectory, folder);
  await writeTextAtomically(folder, IO_JSON_FILE_NAME, text);
}

/** The legacy mapping files that exist, links included: their presence is the problem. */
export async function listLegacyIoFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const fileName of LEGACY_FILE_NAMES) {
    try {
      await lstat(join(folder, fileName));
      found.push(fileName);
    } catch (error) {
      if (!isErrorWithCode(error, "ENOENT")) {
        throw error;
      }
    }
  }
  return found;
}
