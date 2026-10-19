import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENE_PALETTES } from "../packages/viewer/src/theme/scene-palette.ts";

// ADR 0057 rule 3 for the 3D view: each reserved colour of the scene palette is the
// page's token of the same meaning (one meaning, the same everywhere), and names the
// second cue that carries the meaning where colour cannot. A new reserved colour in
// the scene fails here until it is declared.

type ThemeName = "light" | "dark";

interface ReservedSceneColour {
  paletteKey: "selection" | "signalOn" | "jointParent";
  cssToken: string;
  secondCue: string;
}

const RESERVED: readonly ReservedSceneColour[] = [
  { paletteKey: "selection", cssToken: "selection", secondCue: "outline" },
  { paletteKey: "signalOn", cssToken: "state-normal", secondCue: "thickness and opacity" },
  { paletteKey: "jointParent", cssToken: "joint-parent", secondCue: "tint without outline" },
];

const BASE_CSS = readFileSync(
  new URL("../packages/viewer/src/styles/base.css", import.meta.url),
  "utf8",
);

function themeToken(theme: ThemeName, name: string): string | undefined {
  const start = BASE_CSS.indexOf(`:root[data-theme="${theme}"] {`);
  const block = BASE_CSS.slice(start, BASE_CSS.indexOf("}", start));
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block)?.[1]?.toLowerCase();
}

describe.each(["light", "dark"] as const)("the reserved colours of the %s 3D scene", (theme) => {
  it.each(RESERVED)("$paletteKey is --$cssToken, with its second cue", (entry) => {
    expect(SCENE_PALETTES[theme][entry.paletteKey]).toBe(themeToken(theme, entry.cssToken));
    expect(entry.secondCue).toBeTruthy();
  });
});
