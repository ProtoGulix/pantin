import { describe, expect, it } from "vitest";
import { glyphOfLevel, glyphOfTone } from "./state-glyphs.ts";

describe("the glyph of a status tone", () => {
  it("gives each tone its own shape", () => {
    const glyphs = (["ok", "busy", "idle", "error"] as const).map(glyphOfTone);
    expect(glyphs).toEqual(["check", "state-busy", "state-idle", "error"]);
    expect(new Set(glyphs).size).toBe(4);
  });
});

describe("the glyph of a log level", () => {
  it("gives each level its own shape", () => {
    const glyphs = (["error", "warning", "info"] as const).map(glyphOfLevel);
    expect(glyphs).toEqual(["error", "warning", "info"]);
  });
});
