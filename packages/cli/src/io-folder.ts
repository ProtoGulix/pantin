import {
  evaluateIoMapping,
  type IoReading,
  ioTagsOf,
  readIoDocument,
  readIoJson,
  serializeIoDocument,
  unreadableFile,
} from "@pantin/core";
import { IO_JSON_FILE_NAME, type IoMappingResponse, type PantinDocument } from "@pantin/protocol";

// The io.json mapping of a Pantin folder, read offline with the core's own
// code (ADR 0049 point 9): the same checks as GET .../io, against the tags of
// the folder's saved pantin.json.

export type FolderIo = {
  reading: IoReading;
  answer: IoMappingResponse;
  // False when io.json is readable but its text is not the canonical one
  // (channels in another order, other formatting): see describeIoProblem.
  canonical: boolean;
};

/** The io.json of a folder as a reading; a read that fails is unreadable, not a crash. */
export async function readFolderIoReading(
  folder: string,
): Promise<{ reading: IoReading; canonical: boolean }> {
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readIoJson(folder);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { reading: unreadableFile(reason), canonical: true };
  }
  const reading = readIoDocument(bytes);
  const canonical =
    reading.kind !== "document" ||
    new TextDecoder().decode(bytes) === serializeIoDocument(reading.document);
  return { reading, canonical };
}

export async function readFolderIo(folder: string, document: PantinDocument): Promise<FolderIo> {
  const { reading, canonical } = await readFolderIoReading(folder);
  const answer = evaluateIoMapping(reading, ioTagsOf(document));
  return { reading, answer, canonical };
}

export const CANONICAL_ORDER_NOTE = `${IO_JSON_FILE_NAME} is not in canonical form: the channel numbers in its problems count the channels sorted by zone, address and tag, not in the order of the file. "pantin io init <folder> --update" rewrites the file in that order (and maps every unmapped tag into m1).`;
