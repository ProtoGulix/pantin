import { PantinIdSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { fileNameStem, makeUniqueId, slugifyDisplayName } from "./ids.ts";

describe("slugifyDisplayName", () => {
  it.each([
    ["Axe linéaire 800", "axe-lineaire-800"],
    ["  --Rail  X--  ", "rail-x"],
    ["3630.00.0800N", "3630-00-0800n"],
    ["../../etc", "etc"],
    ["…", "fallback"],
    ["", "fallback"],
  ])("turns %j into %j", (displayName, expected) => {
    expect(slugifyDisplayName(displayName, "fallback")).toBe(expected);
  });

  it("always produces a valid id, even from a very long name", () => {
    const slug = slugifyDisplayName(`${"a".repeat(63)} b`, "fallback");
    expect(PantinIdSchema.safeParse(slug).success).toBe(true);
  });
});

describe("makeUniqueId", () => {
  it("adds -2, -3... until the id is free", () => {
    expect(makeUniqueId("rail", new Set())).toBe("rail");
    expect(makeUniqueId("rail", new Set(["rail"]))).toBe("rail-2");
    expect(makeUniqueId("rail", new Set(["rail", "rail-2"]))).toBe("rail-3");
  });

  it("shortens a long id so the suffix fits", () => {
    const longId = `${"a".repeat(62)}-b`;
    const unique = makeUniqueId(longId, new Set([longId]));
    expect(unique).toBe(`${"a".repeat(62)}-2`);
    expect(PantinIdSchema.safeParse(unique).success).toBe(true);
  });
});

describe("fileNameStem", () => {
  it.each([
    ["rail.glb", "rail"],
    ["parts/Rail 800.stl", "Rail 800"],
    ["C:\\cad\\plate.STL", "plate"],
    [".hidden", ".hidden"],
    ["noextension", "noextension"],
  ])("returns the stem of %j", (fileName, expected) => {
    expect(fileNameStem(fileName)).toBe(expected);
  });
});
