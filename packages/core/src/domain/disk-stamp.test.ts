import { describe, expect, it } from "vitest";
import {
  type DiskStamp,
  hasSameContent,
  MISSING_STAMP,
  matchesStat,
  sha256Of,
  stampOf,
} from "./disk-stamp.ts";

const bytes = new TextEncoder().encode("{}");
const present = { kind: "present", size: 2, mtimeMs: 1000 } as const;
const stamp: DiskStamp = stampOf(present, sha256Of(bytes));

describe("disk stamps", () => {
  it("matches the stat it was taken from, and no other size or time", () => {
    expect(matchesStat(stamp, present)).toBe(true);
    expect(matchesStat(stamp, { ...present, size: 3 })).toBe(false);
    expect(matchesStat(stamp, { ...present, mtimeMs: 1001 })).toBe(false);
  });

  it("tells a created or deleted file from a present one", () => {
    expect(matchesStat(MISSING_STAMP, { kind: "missing" })).toBe(true);
    expect(matchesStat(MISSING_STAMP, present)).toBe(false);
    expect(matchesStat(stamp, { kind: "missing" })).toBe(false);
    expect(hasSameContent(MISSING_STAMP, stamp)).toBe(false);
    expect(hasSameContent(stamp, MISSING_STAMP)).toBe(false);
  });

  it("compares the content, not the time", () => {
    const touched = stampOf({ ...present, mtimeMs: 2000 }, sha256Of(bytes));
    const edited = stampOf(present, sha256Of(new TextEncoder().encode("[]")));
    expect(hasSameContent(stamp, touched)).toBe(true);
    expect(hasSameContent(stamp, edited)).toBe(false);
  });

  it("has no stamp for a missing file", () => {
    expect(stampOf({ kind: "missing" }, sha256Of(bytes))).toEqual(MISSING_STAMP);
  });
});
