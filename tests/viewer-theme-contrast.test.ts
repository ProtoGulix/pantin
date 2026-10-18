import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOUR_BLIND_MATRICES, contrast, simulatedDifference } from "./colour-maths.ts";

// ADR 0053 point 7: the tokens of base.css, read as the browser reads them,
// reach WCAG 2 AA (4.5:1) for text on the three grounds.

const BASE_CSS = readFileSync(
  new URL("../packages/viewer/src/styles/base.css", import.meta.url),
  "utf8",
);

type ThemeName = "light" | "dark";

// Read as text: the viewer's sources use browser types, which this project does not have.
const SCENE_PALETTE_TS = readFileSync(
  new URL("../packages/viewer/src/theme/scene-palette.ts", import.meta.url),
  "utf8",
);

const THEME_SELECTORS: Readonly<Record<ThemeName, string>> = {
  dark: ':root[data-theme="dark"]',
  light: ':root[data-theme="light"]',
};

function tokensOf(theme: ThemeName): Map<string, string> {
  const selector = THEME_SELECTORS[theme];
  const start = BASE_CSS.indexOf(`${selector} {`);
  const end = BASE_CSS.indexOf("}", start);
  expect(start, `no ${selector} block in base.css`).toBeGreaterThanOrEqual(0);
  const tokens = new Map<string, string>();
  for (const [, name, value] of BASE_CSS.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

// The IEC fills are the same in both themes, so they sit in the generic :root block.
function fillTokens(): Map<string, string> {
  const start = BASE_CSS.indexOf(":root {");
  const end = BASE_CSS.indexOf("}", start);
  const tokens = new Map<string, string>();
  for (const [, name, value] of BASE_CSS.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

function token(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`--${name} must be a #rrggbb value in base.css, found ${value}.`);
  }
  return value;
}

// The share of a "-soft" tint, read from its color-mix() in base.css.
function tintShare(name: string): number {
  const match = new RegExp(
    `--${name}-soft: color-mix\\(in srgb, var\\(--${name}\\) (\\d+)%, transparent\\);`,
  ).exec(BASE_CSS);
  if (match?.[1] === undefined) {
    throw new Error(`--${name}-soft must be a color-mix() of --${name} with transparent.`);
  }
  return Number(match[1]) / 100;
}

// A see-through tint over a ground, as the browser composes it: channel by channel in sRGB.
function tintOver(tint: string, share: number, ground: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const tintChannel = Number.parseInt(tint.slice(offset, offset + 2), 16);
    const groundChannel = Number.parseInt(ground.slice(offset, offset + 2), 16);
    const mixed = Math.round(share * tintChannel + (1 - share) * groundChannel);
    return mixed.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

const TEXT_TOKENS = [
  "text",
  "text-muted",
  "text-faint",
  "selection",
  "state-abnormal",
  "state-emergency",
  "state-normal",
];
const GROUNDS = ["surface-0", "surface-1", "surface-2"];

describe.each(["light", "dark"] as const)("the %s theme", (theme) => {
  const tokens = tokensOf(theme);

  it.each(TEXT_TOKENS.flatMap((text) => GROUNDS.map((ground) => [text, ground] as const)))(
    "gives --%s 4.5:1 on --%s",
    (text, ground) => {
      expect(contrast(token(tokens, text), token(tokens, ground))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("gives the text on the brand colour 4.5:1", () => {
    expect(contrast(token(tokens, "brand-text"), token(tokens, "brand"))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(["abnormal", "emergency"])("gives the text on the --fill-%s 4.5:1", (state) => {
    const fills = fillTokens();
    expect(
      contrast(token(fills, `on-fill-${state}`), token(fills, `fill-${state}`)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // The journal's warning and error rows (journal.css) lay a tint over --surface-0.
  it.each(
    ["state-abnormal", "state-emergency"].flatMap((state) =>
      ["text", "text-muted"].map((text) => [text, state] as const),
    ),
  )("gives --%s 4.5:1 on a --%s-soft row", (text, state) => {
    const row = tintOver(token(tokens, state), tintShare(state), token(tokens, "surface-0"));
    expect(contrast(token(tokens, text), row)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the 3D scene palette in step with the page", () => {
    const block = SCENE_PALETTE_TS.slice(SCENE_PALETTE_TS.indexOf(`${theme}: {`));
    const sceneColor = (name: string) => new RegExp(`${name}: "(#[0-9a-f]{6})"`).exec(block)?.[1];
    expect(sceneColor("background")).toBe(token(tokens, "viewport-background"));
    expect(sceneColor("selection")).toBe(token(tokens, "selection"));
    expect(sceneColor("drivenJoint")).toBe(token(tokens, "state-normal"));
    expect(sceneColor("jointParent")).toBe(token(tokens, "joint-parent"));
  });

  // The joint preview's parent and child (the selection blue) must stay apart
  // for colour-blind users: Machado 2009 simulations at full severity.
  it.each(Object.keys(COLOUR_BLIND_MATRICES))(
    "keeps --joint-parent apart from --selection under %s vision",
    (vision) => {
      const difference = simulatedDifference(
        token(tokens, "joint-parent"),
        token(tokens, "selection"),
        vision,
      );
      expect(difference).toBeGreaterThanOrEqual(45);
    },
  );
});
