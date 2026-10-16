import { describe, expect, it } from "vitest";
import { parseStoredGroups, parseStoredOpen, serializeGroups } from "./layout-preferences.ts";

describe("stored inspector preferences", () => {
  it("opens the inspector unless it was closed", () => {
    expect(parseStoredOpen(null)).toBe(true);
    expect(parseStoredOpen("garbage")).toBe(true);
    expect(parseStoredOpen("false")).toBe(false);
  });

  it("restores the folded groups and ignores corrupt lists", () => {
    expect([...parseStoredGroups(serializeGroups(new Set(["a", "b"])))]).toEqual(["a", "b"]);
    expect(parseStoredGroups(null).size).toBe(0);
    expect(parseStoredGroups("{oops").size).toBe(0);
    expect(parseStoredGroups('{"a":1}').size).toBe(0);
    expect([...parseStoredGroups('["a",3,null]')]).toEqual(["a"]);
  });
});
