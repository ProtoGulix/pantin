import { describe, expect, it } from "vitest";
import { SCENE_PALETTES } from "./scene-palette.ts";
import { parseStoredTheme, resolveTheme, THEME_CHOICES } from "./theme.ts";

describe("resolveTheme", () => {
  it("follows the system preference for the system choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the system preference for an explicit choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("parseStoredTheme", () => {
  it("accepts each known choice", () => {
    for (const choice of THEME_CHOICES) {
      expect(parseStoredTheme(choice)).toBe(choice);
    }
  });

  it("falls back to system for a missing or unknown value", () => {
    expect(parseStoredTheme(null)).toBe("system");
    expect(parseStoredTheme("sepia")).toBe("system");
  });
});

describe("SCENE_PALETTES", () => {
  it("has a different background and selection colour per theme", () => {
    expect(SCENE_PALETTES.light.background).not.toBe(SCENE_PALETTES.dark.background);
    expect(SCENE_PALETTES.light.selection).not.toBe(SCENE_PALETTES.dark.selection);
  });
});
