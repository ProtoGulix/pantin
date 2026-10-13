import { open } from "node:fs/promises";
import { isErrorWithCode } from "./safe-paths.ts";

/**
 * Reads at most `limit + 1` bytes of a file, so that the caller can tell a
 * file over the limit without loading it whole; undefined when it is missing.
 */
export async function readFileUpTo(path: string, limit: number): Promise<Uint8Array | undefined> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "r");
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
  try {
    const buffer = new Uint8Array(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
