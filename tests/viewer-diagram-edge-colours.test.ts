import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blend, COLOUR_BLIND_MATRICES, contrast, simulatedDifference } from "./colour-maths.ts";

// ADR 0057 slice 7: the five wires of the chain diagram. Their colours are data colours
// (rule 3: no state hue, no brand), per theme, each 3:1 from the band they are drawn on, as
// drawn (stroke-opacity applied). Five hues cannot all be 40 apart under colour blindness on a
// 3:1 ground (a search over the allowed hues peaked near 20 in the dark theme, 29 in the
// light), so the measured floors are registered below. The second cue of every wire is its
// dash pattern and width, and the abbreviation written on it; both are tested here.

type ThemeName = "light" | "dark";
const KINDS = ["pneumatic", "ac_power", "servo", "mechanical", "observation"] as const;
type Kind = (typeof KINDS)[number];
const STYLES = new URL("../packages/viewer/src/styles/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, STYLES), "utf8");
const DIAGRAM_CSS = read("diagram.css");
const BASE_CSS = read("base.css");
const GROUND_RATIO = 3;

const THEME_HEADERS: Record<ThemeName, string> = {
  dark: ':root,\n:root[data-theme="dark"] {',
  light: ':root[data-theme="light"] {',
};

function blockAfter(css: string, header: string): string {
  const start = css.indexOf(header);
  if (start < 0) {
    throw new Error(`Missing CSS block: ${header}`);
  }
  return css.slice(start, css.indexOf("}", start));
}

function token(css: string, theme: ThemeName, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(
    blockAfter(css, THEME_HEADERS[theme]),
  );
  if (match?.[1] === undefined) {
    throw new Error(`--${name} must be a #rrggbb value in the ${theme} theme.`);
  }
  return match[1];
}

function declaration(selector: string, property: string): string | null {
  const block = blockAfter(DIAGRAM_CSS, `${selector} {`);
  return new RegExp(`${property}:\\s*([^;]+);`).exec(block)?.[1] ?? null;
}

const edgeColour = (theme: ThemeName, kind: Kind) =>
  token(DIAGRAM_CSS, theme, `edge-${kind.replace("_", "-")}`);
const restingAlpha = Number(declaration(".diagram-edge", "stroke-opacity"));
// A band (surface-0) is what a wire is drawn on; the page ground is the other possibility.
const grounds = (theme: ThemeName) => [
  token(BASE_CSS, theme, "surface-0"),
  token(BASE_CSS, theme, "viewport-background"),
];

// Measured floors (minimum over protanopia, deuteranopia, tritanopia) of the drawn wires.
const FLOORS: Record<ThemeName, readonly (readonly [Kind, Kind, number])[]> = {
  dark: [
    ["pneumatic", "ac_power", 21],
    ["pneumatic", "servo", 21],
    ["pneumatic", "mechanical", 21],
    ["pneumatic", "observation", 22],
    ["ac_power", "servo", 37],
    ["ac_power", "mechanical", 21],
    ["ac_power", "observation", 40],
    ["servo", "mechanical", 21],
    ["servo", "observation", 24],
    ["mechanical", "observation", 29],
  ],
  light: [
    ["pneumatic", "ac_power", 40],
    ["pneumatic", "servo", 25],
    ["pneumatic", "mechanical", 33],
    ["pneumatic", "observation", 26],
    ["ac_power", "servo", 28],
    ["ac_power", "mechanical", 28],
    ["ac_power", "observation", 28],
    ["servo", "mechanical", 30],
    ["servo", "observation", 37],
    ["mechanical", "observation", 31],
  ],
};

function hueOf(hex: string): { hue: number; saturation: number } {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(
    (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  if (spread === 0) {
    return { hue: 0, saturation: 0 };
  }
  const raw =
    max === r ? ((g - b) / spread) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return { hue: (raw * 60 + 360) % 360, saturation: spread / max };
}

describe.each(["light", "dark"] as const)("the diagram wires of the %s theme", (theme) => {
  it.each(KINDS)("%s is as drawn at 3:1 from its ground, resting and lit", (kind) => {
    for (const ground of grounds(theme)) {
      const colour = edgeColour(theme, kind);
      expect(contrast(blend(colour, ground, restingAlpha), ground)).toBeGreaterThanOrEqual(
        GROUND_RATIO,
      );
      expect(contrast(colour, ground)).toBeGreaterThanOrEqual(GROUND_RATIO);
    }
  });

  // Red, orange, yellow and green are the state colours and the brand: a grey, or a hue
  // from cyan to magenta (Okabe-Ito sky blue, blue, reddish purple), is a data colour.
  it.each(KINDS)("%s takes no state or brand hue", (kind) => {
    const { hue, saturation } = hueOf(edgeColour(theme, kind));
    expect(saturation < 0.12 || (hue >= 190 && hue <= 340)).toBe(true);
  });

  it.each(FLOORS[theme])("keeps %s and %s apart, floor %i, as drawn", (first, second, floor) => {
    const ground = grounds(theme)[0] ?? "";
    for (const vision of Object.keys(COLOUR_BLIND_MATRICES)) {
      const difference = simulatedDifference(
        blend(edgeColour(theme, first), ground, restingAlpha),
        blend(edgeColour(theme, second), ground, restingAlpha),
        vision,
      );
      expect(difference).toBeGreaterThanOrEqual(floor);
    }
  });

  it("registers every pair of the five wires", () => {
    expect(FLOORS[theme]).toHaveLength((KINDS.length * (KINDS.length - 1)) / 2);
  });
});

describe("the second cues of the diagram wires", () => {
  const lineStyle = (kind: Kind) =>
    [
      declaration(`.diagram-edge--${kind}`, "stroke-dasharray"),
      declaration(`.diagram-edge--${kind}`, "stroke-width") ??
        declaration(".diagram-edge", "stroke-width"),
    ].join(" / ");

  it("gives each kind its own dash pattern and width", () => {
    expect(new Set(KINDS.map(lineStyle)).size).toBe(KINDS.length);
  });

  it("draws the observation wire thinner than the pneumatic one, the other dashed wire", () => {
    const width = (kind: Kind) =>
      Number(
        declaration(`.diagram-edge--${kind}`, "stroke-width") ??
          declaration(".diagram-edge", "stroke-width"),
      );
    expect(width("observation")).toBeLessThan(width("pneumatic"));
  });

  it.each(["en", "fr"])("writes a distinct short abbreviation per kind in %s", (language) => {
    // The locale files are the repository's own flat string maps (checked by the i18n tests).
    const messages = JSON.parse(
      readFileSync(
        new URL(`../packages/viewer/src/i18n/locales/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>;
    const labels = KINDS.map((kind) => messages[`diagram.edge.abbreviation.${kind}`]);
    expect(labels.every((label) => label !== undefined && label.length <= 5)).toBe(true);
    expect(new Set(labels).size).toBe(KINDS.length);
  });
});
