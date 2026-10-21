import { type IoReading, readIoDocument, unreadableFile } from "../domain/io-document-text.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";

// Reading io.json from the store (ADR 0049 point 3, ADR 0064 point 7).

/** True when the file on disk is in an older version than the reading. */
export function isMigrated(io: IoReading): boolean {
  return io.kind === "document" && io.migratedFrom !== undefined;
}

// A broken io.json is a mapping problem, never a reason to refuse pantin.json.
export async function readIoReading(
  store: Pick<PantinStore, "readIoFile">,
  pantinId: string,
): Promise<IoReading> {
  try {
    return readIoDocument(await store.readIoFile(pantinId));
  } catch (error) {
    return unreadableFile(unreadableReason(error));
  }
}

// The system error code (EISDIR, EACCES...) says what to fix; the path is left
// out, as in every other message the API sends.
function unreadableReason(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  const code = error instanceof Error && "code" in error ? String(error.code) : null;
  return code === null ? "the file system refused" : `the file system refused (${code})`;
}
