import { createHash } from "node:crypto";

// What Pantin remembers of a file of the Pantin folder, to notice that it was
// modified outside Pantin (ADR 0063). Pure: the file system is read at the
// edge, by the store.

export type FileStat = { kind: "missing" } | { kind: "present"; size: number; mtimeMs: number };

export type DiskStamp =
  | { kind: "missing" }
  | { kind: "present"; size: number; mtimeMs: number; sha256: string };

export const MISSING_STAMP: DiskStamp = { kind: "missing" };

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The stamp of a file with the hash of its bytes, read or written by Pantin itself. */
export function stampOf(stat: FileStat, sha256: string): DiskStamp {
  return stat.kind === "missing" ? MISSING_STAMP : { ...stat, sha256 };
}

/** The cheap test: same size and same modification time, so no need to read the file. */
export function matchesStat(stamp: DiskStamp, stat: FileStat): boolean {
  if (stamp.kind === "missing" || stat.kind === "missing") {
    return stamp.kind === stat.kind;
  }
  return stamp.size === stat.size && stamp.mtimeMs === stat.mtimeMs;
}

/** The expensive test: a touch or a checkout of the same bytes is no edit. */
export function hasSameContent(before: DiskStamp, after: DiskStamp): boolean {
  if (before.kind === "missing" || after.kind === "missing") {
    return before.kind === after.kind;
  }
  return before.sha256 === after.sha256;
}
