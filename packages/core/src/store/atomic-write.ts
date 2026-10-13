import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Writes a temporary file in the same folder (so the rename stays on one file
 * system), then renames it: readers never see a half written file. The folder
 * is already checked by the caller.
 */
export async function writeTextAtomically(
  folder: string,
  fileName: string,
  text: string,
): Promise<void> {
  const temporaryPath = join(folder, `.${fileName}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, join(folder, fileName));
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
