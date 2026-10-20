import { join } from "node:path";
import { IO_FILE_MAX_BYTES, IO_JSON_FILE_NAME } from "@pantin/protocol";
import { writeTextAtomically } from "./atomic-write.ts";
import { readFileUpTo } from "./bounded-read.ts";
import { assertRealPathInside, isErrorWithCode } from "./safe-paths.ts";

// The mapping files of one Pantin folder (ADR 0049 point 3).

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
