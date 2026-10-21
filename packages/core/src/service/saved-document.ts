import type { PantinDocument, PantinId } from "@pantin/protocol";
import { readValidDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";

// Reads and validates pantin.json without opening the Pantin.
export async function readSavedDocument(
  context: { store: PantinStore },
  pantinId: PantinId,
): Promise<PantinDocument> {
  return (await readSavedReading(context, pantinId)).document;
}

export async function readSavedReading(context: { store: PantinStore }, pantinId: PantinId) {
  const text = await context.store.readDocumentText(pantinId);
  if (text === undefined) {
    throw new ApiError(
      "not_found",
      `No Pantin with id "${pantinId}". List them with GET /api/pantins.`,
    );
  }
  const location = context.store.describeDocumentLocation(pantinId);
  return readValidDocument(text, location);
}
