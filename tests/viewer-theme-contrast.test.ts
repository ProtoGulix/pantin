import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

function channelLuminance(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    channelLuminance(Number.parseInt(hex.slice(offset, offset + 2), 16)),
  );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function token(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`--${name} must be a #rrggbb value in base.css, found ${value}.`);
  }
  return value;
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

  it.each(["state-abnormal", "state-emergency"])("gives the text on a --%s fill 4.5:1", (state) => {
    expect(contrast(token(tokens, "on-state"), token(tokens, state))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the 3D scene palette in step with the page", () => {
    const block = SCENE_PALETTE_TS.slice(SCENE_PALETTE_TS.indexOf(`${theme}: {`));
    const sceneColor = (name: string) => new RegExp(`${name}: "(#[0-9a-f]{6})"`).exec(block)?.[1];
    expect(sceneColor("background")).toBe(token(tokens, "viewport-background"));
    expect(sceneColor("selection")).toBe(token(tokens, "selection"));
    expect(sceneColor("drivenJoint")).toBe(token(tokens, "state-normal"));
  });
});
