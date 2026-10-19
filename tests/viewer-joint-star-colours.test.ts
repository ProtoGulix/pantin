import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "./colour-maths.ts";

// ADR 0059 point 5 and ADR 0057: the joint star is neutral. Its lines, glyphs, shapes and names
// are drawn with the neutral text tokens at 3:1 or more against the ground they sit on (WCAG
// 1.4.11 for the shapes, 1.4.3 for the names), in both themes; the selection blue is the only
// colour, and only on a selected node or edge and its path. No state colour, no brand orange:
// the allowlist of viewer-colour-allowlist.test.ts would have to declare one, and it has no
// entry for joint-star.css.

type ThemeName = "light" | "dark";
const STYLES = new URL("../packages/viewer/src/styles/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, STYLES), "utf8");
const STAR_CSS = `${read("joint-star.css")}\n${read("joint-star-controls.css")}`;
const BASE_CSS = read("base.css");
const RATIO = 3;
const TEXT_RATIO = 4.5;

const THEME_HEADERS: Record<ThemeName, string> = {
  dark: ':root,\n:root[data-theme="dark"] {',
  light: ':root[data-theme="light"] {',
};

function tokenValue(theme: ThemeName, name: string): string {
  const start = BASE_CSS.indexOf(THEME_HEADERS[theme]);
  const block = BASE_CSS.slice(start, BASE_CSS.indexOf("}", start));
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block);
  if (match?.[1] === undefined) {
    throw new Error(`--${name} must be a #rrggbb value in the ${theme} theme.`);
  }
  return match[1];
}

// The token a property of the first rule whose selector contains `selector` takes.
function tokenOf(selector: string, property: string): string {
  const header = STAR_CSS.indexOf(selector);
  const open = STAR_CSS.indexOf("{", header);
  const body = STAR_CSS.slice(open, STAR_CSS.indexOf("}", open));
  const match = new RegExp(`${property}:\\s*var\\(--([\\w-]+)\\)`).exec(body);
  if (header < 0 || match?.[1] === undefined) {
    throw new Error(`${selector} must set ${property} from a token.`);
  }
  return match[1];
}

// [selector, property, token ground, minimum ratio]
const DRAWN: readonly (readonly [string, string, string, number])[] = [
  [".joint-star-edge__line {", "stroke", "viewport-background", RATIO],
  [".joint-star-edge__line.is-faint", "stroke", "viewport-background", RATIO],
  [".joint-star-glyph {", "stroke", "viewport-background", RATIO],
  [".joint-star-glyph--weld,", "fill", "viewport-background", RATIO],
  [".joint-star-node__shape {", "stroke", "viewport-background", RATIO],
  [".joint-star-node__shape {", "stroke", "surface-2", RATIO],
  [".joint-star-node__count {", "fill", "viewport-background", TEXT_RATIO],
  [".joint-star-node__chevron {", "fill", "viewport-background", RATIO],
  [".joint-star__fit {", "color", "surface-1", TEXT_RATIO],
  [".joint-star-legend__toggle {", "color", "surface-1", TEXT_RATIO],
  [".joint-star-edge__label {\n  font-size", "fill", "viewport-background", TEXT_RATIO],
  [".joint-star-node__label {", "fill", "viewport-background", TEXT_RATIO],
  [".joint-star-edge.is-selected .joint-star-edge__line", "stroke", "viewport-background", RATIO],
  [".joint-star-node.is-on-path .joint-star-node__shape", "stroke", "viewport-background", RATIO],
  [".joint-star-node.is-selected .joint-star-node__shape", "stroke", "viewport-background", RATIO],
  [".joint-star-node__focus {", "stroke", "viewport-background", RATIO],
  [".joint-star-legend {", "color", "surface-1", TEXT_RATIO],
];

describe.each(["light", "dark"] as const)("the joint star of the %s theme", (theme) => {
  it.each(DRAWN)(
    "%s %s is at %f:1 or more from its ground",
    (selector, property, ground, ratio) => {
      const colour = tokenValue(theme, tokenOf(selector, property));
      expect(contrast(colour, tokenValue(theme, ground))).toBeGreaterThanOrEqual(ratio);
    },
  );
});

describe("the joint star stylesheet", () => {
  it("takes no state colour, no IEC fill and no brand colour", () => {
    expect(STAR_CSS).not.toMatch(/var\(--(?:state-|fill-|brand)/);
  });

  it("uses the selection blue only for what is selected, on its path, or in the legend", () => {
    const rules = STAR_CSS.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
    const blue = rules.filter((rule) => /var\(--selection(?:-soft)?\)/.test(rule));
    expect(blue.length).toBeGreaterThan(0);
    for (const rule of blue) {
      expect(rule).toMatch(/is-selected|is-on-path|__selection/);
    }
  });
});
