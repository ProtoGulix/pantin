import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  describeIoProblem,
  ioTagsOf,
  serializeIoDocument,
  writeTextAtomically,
} from "@pantin/core";
import { IO_JSON_FILE_NAME, type IoDocument } from "@pantin/protocol";
import { type CommandResult, done, refused } from "./command-result.ts";
import { readFolderIoReading } from "./io-folder.ts";
import { freshIoDocument, INIT_MODULE_KEY, mapTagsIntoFirstModule } from "./io-init.ts";
import { readFolderDocument } from "./validate-folder.ts";

// `pantin io init <folder> [--update]` (ADR 0049 point 9). Without --update it
// refuses to touch an existing io.json. With it, the unmapped tags are mapped
// into module m1 and the file is rewritten in canonical form.

type Start = { refusal: string[] } | { existing: IoDocument | null; canonical: boolean };

// What is on disk decides whether init may go on at all.
async function startOf(folder: string, update: boolean): Promise<Start> {
  const { reading, canonical } = await readFolderIoReading(folder);
  if (reading.kind !== "missing" && !update) {
    return {
      refusal: [
        `${IO_JSON_FILE_NAME} already exists in ${folder}: it belongs to you. Use --update to map the unmapped tags.`,
      ],
    };
  }
  if (reading.kind === "unreadable") {
    return {
      refusal: [
        `${IO_JSON_FILE_NAME} cannot be used, so tags cannot be added safely:`,
        ...reading.problems.map(describeIoProblem),
      ],
    };
  }
  return { existing: reading.kind === "document" ? reading.document : null, canonical };
}

export async function ioInit(folder: string, update: boolean): Promise<CommandResult> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return refused(read.problems);
  }
  const start = await startOf(folder, update);
  if ("refusal" in start) {
    return refused(start.refusal);
  }
  const { existing, canonical } = start;
  const mapped = new Set(existing?.modules.flatMap((module) => module.channels.map((c) => c.tag)));
  const unmapped = ioTagsOf(read.document).filter((tag) => !mapped.has(tag.name));
  const updated = mapTagsIntoFirstModule(existing ?? freshIoDocument(), unmapped);
  if (typeof updated === "string") {
    return refused([updated]);
  }
  if (existing === null) {
    await writeFile(join(folder, IO_JSON_FILE_NAME), serializeIoDocument(updated), { flag: "wx" });
    return done(
      `Wrote ${IO_JSON_FILE_NAME} (${unmapped.length} channels in "${INIT_MODULE_KEY}").`,
    );
  }
  if (unmapped.length === 0 && canonical) {
    return done("Nothing to add: every tag is mapped.");
  }
  await writeTextAtomically(folder, IO_JSON_FILE_NAME, serializeIoDocument(updated));
  return done(
    unmapped.length === 0
      ? `Rewrote ${IO_JSON_FILE_NAME} in canonical form; every tag was already mapped.`
      : `Mapped ${unmapped.length} tag(s) into "${INIT_MODULE_KEY}" in ${IO_JSON_FILE_NAME}.`,
  );
}
