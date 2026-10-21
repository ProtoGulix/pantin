import type { ChangedOutsideFile, PantinId } from "@pantin/protocol";
import type { ConsoleBuffer } from "../domain/console-buffer.ts";
import { fileChangedOutsideEvent } from "../domain/console-events.ts";
import {
  type DiskStamp,
  hasSameContent,
  MISSING_STAMP,
  matchesStat,
  sha256Of,
  stampOf,
} from "../domain/disk-stamp.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";
import { recordConsoleEvents } from "./console-record.ts";

// Detecting that pantin.json or io.json was modified outside Pantin (ADR 0063):
// a stamp of each file's DISK bytes (not of the in-memory text, which differs
// for a file migrated on read), compared at a GET and at a save only.

export const WATCHED_FILES: readonly ChangedOutsideFile[] = ["pantin.json", "io.json"];

// Structural types, so that open-pantins.ts can use this file without a cycle.
type StampContext = { store: PantinStore; wallClock: () => Date };
type StampedPantin = {
  diskStamps: DiskStamps;
  changedOutside: OutsideFlags;
  console: ConsoleBuffer;
  stepCount: number;
};

// Files found modified outside since they were read; a save or a discard clears it.
export type OutsideFlags = Set<ChangedOutsideFile>;

export type DiskStamps = Record<ChangedOutsideFile, DiskStamp>;

export const NO_STAMPS: DiskStamps = { "pantin.json": MISSING_STAMP, "io.json": MISSING_STAMP };

/** Reads the stamp of both files; taken before their content is read, so a race is seen later. */
export async function takeStamps(context: StampContext, pantinId: PantinId): Promise<DiskStamps> {
  const [document, io] = await Promise.all(
    WATCHED_FILES.map((file) => context.store.readFileStamp(pantinId, file)),
  );
  return { "pantin.json": document ?? MISSING_STAMP, "io.json": io ?? MISSING_STAMP };
}

/** After Pantin wrote `file` itself: the written text, and the stat the disk now shows. */
export async function stampWrittenFile(
  context: StampContext,
  pantinId: PantinId,
  openPantin: StampedPantin,
  file: ChangedOutsideFile,
  text: string,
): Promise<void> {
  // An outside write or rename landing between our write and this stat is stamped as ours
  // and missed; the window is one stat wide, accepted.
  const stat = await context.store.statFile(pantinId, file);
  openPantin.diskStamps[file] = stampOf(stat, sha256Of(new TextEncoder().encode(text)));
}

// Changed on disk since the stamp: the cheap test first, then the bytes.
async function findChange(
  context: StampContext,
  pantinId: PantinId,
  openPantin: StampedPantin,
  file: ChangedOutsideFile,
): Promise<boolean> {
  const known = openPantin.diskStamps[file];
  if (matchesStat(known, await context.store.statFile(pantinId, file))) {
    return false;
  }
  const current = await context.store.readFileStamp(pantinId, file);
  // Kept even when the content is the same (a touch), so the next check is cheap;
  // and when it differs, so that this content is reported once.
  openPantin.diskStamps[file] = current;
  return !hasSameContent(known, current);
}

/**
 * Looks at both files, flags and reports each one that holds new content.
 * Returns the files newly found changed. Runs in the Pantin's save queue, so
 * that it never meets a save between its write and its stamp.
 */
export async function checkExternalEdits(
  context: StampContext,
  pantinId: PantinId,
  openPantin: StampedPantin,
): Promise<ChangedOutsideFile[]> {
  const found: ChangedOutsideFile[] = [];
  for (const file of WATCHED_FILES) {
    if (await findChange(context, pantinId, openPantin, file)) {
      found.push(file);
      openPantin.changedOutside.add(file);
    }
  }
  recordConsoleEvents(context, openPantin, found.map(fileChangedOutsideEvent));
  return found;
}

/** The refusal of the first save that finds an outside edit (ADR 0063 point 4). */
export function externalEditConflict(files: readonly ChangedOutsideFile[]): ApiError {
  const message =
    files.length === 1
      ? `${files[0]} was modified outside Pantin since it was opened. Save again to overwrite it, or reload it.`
      : `${files.join(" and ")} were modified outside Pantin since they were opened. Save again to overwrite them, or reload them.`;
  return new ApiError("conflict", message);
}
