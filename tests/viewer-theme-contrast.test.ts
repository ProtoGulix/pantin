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

  it.each(["state-abnormal", "state-emergency"])("gives the text on a --%s fill 4.5:1", (state) => {
    expect(contrast(token(tokens, "on-state"), token(tokens, state))).toBeGreaterThanOrEqual(4.5);
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

const COLOUR_BLIND_MATRICES: Readonly<Record<string, number[][]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function toLinear(hex: string): number[] {
  return [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
}

function toLab([red = 0, green = 0, blue = 0]: number[]): number[] {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const [r, g, b] = [clamp(red), clamp(green), clamp(blue)] as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// CIE76 distance between two hex colours as seen with the given colour blindness.
function simulatedDifference(first: string, second: string, vision: string): number {
  const matrix = COLOUR_BLIND_MATRICES[vision] ?? [];
  const seen = (hex: string) => {
    const linear = toLinear(hex);
    return toLab(
      matrix.map((row) => row.reduce((sum, weight, i) => sum + weight * (linear[i] ?? 0), 0)),
    );
  };
  return Math.hypot(...seen(first).map((value, i) => value - (seen(second)[i] ?? 0)));
}
