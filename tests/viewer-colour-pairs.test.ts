import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AXIS_COLOURS,
  CONVEYOR_VOLUME_COLOURS,
  VOLUME_ALPHAS,
} from "../packages/viewer/src/theme/data-palette.ts";
import { SCENE_PALETTES } from "../packages/viewer/src/theme/scene-palette.ts";
import { signalLookFor } from "../packages/viewer/src/theme/signal-look.ts";
import { blend, COLOUR_BLIND_MATRICES, contrast, simulatedDifference } from "./colour-maths.ts";

// ADR 0057 rule 2: two data colours shown together stay apart for colour blind
// users (CIE76 difference of at least 40 under protanopia, deuteranopia and
// tritanopia), and each stands out from its ground (WCAG 1.4.11, 3:1). This
// file lists the pairs that meet it, plus the pairs that cannot and name their
// second cue; a later slice adds a pair here when it fixes it, so a regression
// shows at once.

type ThemeName = "light" | "dark";

interface ColourPair {
  name: string;
  first: string;
  second: string;
  /** Simulated CIE76 floor; ADR 0057 asks 40, the joint preview pair keeps its 45. */
  minDifference: number;
  /** Required when minDifference is below 40: what tells the two apart instead of colour. */
  secondCue?: string;
  /** Set for fills: their outline, not the fill, must stand out from the panel surfaces. */
  filledBadge?: boolean;
}

const RULE_DIFFERENCE = 40;
const GROUND_RATIO = 3;

function axesPairs(theme: ThemeName): ColourPair[] {
  const axes = AXIS_COLOURS[theme];
  // Measured floor of the light set (deutan 32 for X/Y, tritan 31 for Y/Z): 40 is
  // out of reach on the light ground, so the letters at the axes are the cue.
  const lightFloor = { minDifference: 30, secondCue: "letters" };
  const dark = theme === "dark";
  return [
    {
      name: "axes X and Y",
      first: axes.x,
      second: axes.y,
      ...(dark ? { minDifference: RULE_DIFFERENCE } : lightFloor),
    },
    { name: "axes X and Z", first: axes.x, second: axes.z, minDifference: RULE_DIFFERENCE },
    {
      name: "axes Y and Z",
      first: axes.y,
      second: axes.z,
      ...(dark ? { minDifference: RULE_DIFFERENCE } : lightFloor),
    },
  ];
}

const BASE_CSS = readFileSync(
  new URL("../packages/viewer/src/styles/base.css", import.meta.url),
  "utf8",
);

function fillToken(name: string): string {
  const match = new RegExp(`--fill-${name}:\\s*(#[0-9a-fA-F]{6});`).exec(BASE_CSS);
  if (match?.[1] === undefined) {
    throw new Error(`--fill-${name} must be a #rrggbb value in base.css.`);
  }
  return match[1];
}

// ADR 0057 rule 6: the IEC fills are the same in both themes. They are badges on panel
// surfaces, not on the scene ground: their outline (--fill-outline) must reach 3:1 there.
function fillPairs(): ColourPair[] {
  return [
    {
      name: "fills abnormal and emergency",
      first: fillToken("abnormal"),
      second: fillToken("emergency"),
      minDifference: RULE_DIFFERENCE,
      filledBadge: true,
    },
  ];
}

// Sensor markers and light beams share one coding (signal on / off, ADR 0057 rule 3).
// The OFF neutral is drawn translucent, so the pair measures the colour as drawn, its
// blend over the scene ground. Markers render in group 1 over the bodies: what is
// behind them is not always the ground, so the ground is the reference, not a guarantee.
// ON against the drawn OFF stays under 40 (floors measured below): the second cue is
// thickness and opacity.
const SIGNAL_DRAWN_FLOORS: Record<ThemeName, number> = { light: 25, dark: 28 };

function signalPairs(theme: ThemeName): ColourPair[] {
  const scene = SCENE_PALETTES[theme];
  const drawnOff = blend(scene.signalOff, scene.background, signalLookFor(false).alpha);
  return [
    {
      name: "sensor marker and light beam, on and as drawn off",
      first: scene.signalOn,
      second: drawnOff,
      minDifference: SIGNAL_DRAWN_FLOORS[theme],
      secondCue: "thickness and opacity",
    },
  ];
}

// Conveyor volumes (ADR 0057): neutral greys. The guide and the belt are lit PBR materials,
// whose lit colour depends on the lights; the guide's albedo blended over the ground at its
// alpha stands in for what is drawn, and the belt is measured by its unlit edge colour.
// The emitter and absorber glow, so their edge colours are what is drawn. Greys differ by lightness only, which the
// ground limit squeezes to about 45 at best: the floors below are measured, and the second
// cue is the glyph ("+" emitter, "−" absorber), the form (outlined volume, solid guide, flat
// slab with an arrow) and, against the selection, the outline drawn around the selected object.
type GreyMark = "emitter" | "absorber" | "guide" | "belt" | "selection outline";
const GREY_FLOORS: Record<ThemeName, readonly (readonly [GreyMark, GreyMark, number])[]> = {
  light: [
    ["emitter", "absorber", 40],
    ["emitter", "guide", 30],
    ["absorber", "guide", 16],
    ["guide", "belt", 8],
    ["emitter", "belt", 22],
    ["absorber", "belt", 25],
    ["emitter", "selection outline", 33],
    ["absorber", "selection outline", 29],
    ["guide", "selection outline", 17],
  ],
  dark: [
    ["emitter", "absorber", 40],
    ["emitter", "guide", 26],
    ["absorber", "guide", 19],
    ["guide", "belt", 10],
    ["emitter", "belt", 15],
    ["absorber", "belt", 29],
    ["emitter", "selection outline", 40],
    ["absorber", "selection outline", 34],
    ["guide", "selection outline", 25],
  ],
};

function volumePairs(theme: ThemeName): ColourPair[] {
  const scene = SCENE_PALETTES[theme];
  const volumes = CONVEYOR_VOLUME_COLOURS[theme];
  const drawnGuide = blend(volumes.guide.color, scene.background, VOLUME_ALPHAS.guide);
  const marks = {
    emitter: volumes.emitter.edges ?? volumes.emitter.color,
    absorber: volumes.absorber.edges ?? volumes.absorber.color,
    guide: drawnGuide,
    belt: volumes.belt.edges ?? volumes.belt.color,
    "selection outline": scene.selection,
  };
  return GREY_FLOORS[theme].map(([first, second, minDifference]) => ({
    name: `conveyor ${first} and ${second}`,
    first: marks[first],
    second: marks[second],
    minDifference,
    secondCue: "glyph, form and outline",
  }));
}

function themeToken(theme: ThemeName, name: string): string {
  const start = BASE_CSS.indexOf(`:root[data-theme="${theme}"] {`);
  const block = BASE_CSS.slice(start, BASE_CSS.indexOf("}", start));
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block);
  if (match?.[1] === undefined) {
    throw new Error(`--${name} must be a #rrggbb value in the ${theme} theme of base.css.`);
  }
  return match[1];
}

const PANEL_SURFACES = ["surface-0", "surface-1", "surface-2"];

function registeredPairs(theme: ThemeName): ColourPair[] {
  const scene = SCENE_PALETTES[theme];
  return [
    {
      name: "joint preview parent and child",
      first: scene.jointParent,
      second: scene.selection,
      minDifference: 45,
    },
    {
      name: "face alignment moving and target",
      first: scene.selection,
      second: scene.jointParent,
      minDifference: 45,
    },
    ...axesPairs(theme),
    ...signalPairs(theme),
    ...volumePairs(theme),
    ...fillPairs(),
  ];
}

describe.each(["light", "dark"] as const)("the data colour pairs of the %s theme", (theme) => {
  const ground = SCENE_PALETTES[theme].background;
  const pairs = registeredPairs(theme);

  it.each(
    pairs.flatMap((pair) =>
      Object.keys(COLOUR_BLIND_MATRICES).map((vision) => [pair, vision] as const),
    ),
  )("keeps $0.name apart under $1 vision", (pair, vision) => {
    expect(simulatedDifference(pair.first, pair.second, vision)).toBeGreaterThanOrEqual(
      pair.minDifference,
    );
  });

  it.each(pairs.filter((pair) => pair.minDifference < RULE_DIFFERENCE))(
    "names the second cue of $name, below the rule",
    (pair) => {
      expect(pair.secondCue).toBeTruthy();
    },
  );

  it.each(
    pairs
      .filter((pair) => pair.filledBadge !== true)
      .flatMap(
        (pair) =>
          [
            [pair.name, pair.first],
            [pair.name, pair.second],
          ] as const,
      ),
  )("stands out from the ground: %s, %s", (_name, colour) => {
    expect(contrast(colour, ground)).toBeGreaterThanOrEqual(GROUND_RATIO);
  });
});

describe.each(["light", "dark"] as const)("the filled badges of the %s theme", (theme) => {
  const outline = themeToken(theme, "fill-outline");
  const fills = fillPairs().flatMap((pair) => [pair.first, pair.second]);

  it.each(PANEL_SURFACES)("outline stands out from --%s", (surface) => {
    expect(contrast(outline, themeToken(theme, surface))).toBeGreaterThanOrEqual(GROUND_RATIO);
  });

  it.each(fills)("fill %s has an outline apart from the fill itself", (fill) => {
    expect(contrast(outline, fill)).toBeGreaterThan(1);
  });
});

// The "+" and "−" glyphs are the second cue of the grey volume pairs, so they stay legible
// whatever the grey: text-level contrast (4.5:1) against the ground, against the volume as
// drawn (its colour blended over the ground) and against their own halo.
describe.each(["light", "dark"] as const)("the volume glyphs of the %s theme", (theme) => {
  const ground = SCENE_PALETTES[theme].background;
  const { glyph, ...volumes } = CONVEYOR_VOLUME_COLOURS[theme];
  const TEXT_RATIO = 4.5;

  it("stands out from the ground", () => {
    expect(contrast(glyph.fill, ground)).toBeGreaterThanOrEqual(TEXT_RATIO);
  });

  it.each(["emitter", "absorber"] as const)("stands out from the drawn %s volume", (style) => {
    const drawn = blend(volumes[style].color, ground, VOLUME_ALPHAS[style]);
    expect(contrast(glyph.fill, drawn)).toBeGreaterThanOrEqual(TEXT_RATIO);
    const edges = volumes[style].edges ?? volumes[style].color;
    expect(contrast(glyph.halo, edges)).toBeGreaterThan(1);
  });

  it("stands out from its own halo, which covers any grey behind it", () => {
    expect(contrast(glyph.fill, glyph.halo)).toBeGreaterThanOrEqual(TEXT_RATIO);
  });
});

// ADR 0057 point 7: no literal colour in the scene, the conveyors or the view cube.
const VIEWER_SOURCES = new URL("../packages/viewer/src/", import.meta.url);
const CHECKED_FOLDERS = ["scene", "conveyors"];
const CHECKED_FILES = ["ui/view-cube.ts"];
const LITERAL_COLOUR =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|new Color[34]\(\s*[\d.-]|\bColor[34]\.(?!From)[A-Z]\w*\(/;

function sourcesToCheck(): string[] {
  const inFolders = CHECKED_FOLDERS.flatMap((folder) =>
    readdirSync(new URL(`${folder}/`, VIEWER_SOURCES))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => `${folder}/${name}`),
  );
  return [...inFolders, ...CHECKED_FILES];
}

describe("the colour literals of the viewer", () => {
  it.each(sourcesToCheck())("are all in data-palette.ts and scene-palette.ts: %s", (path) => {
    const lines = readFileSync(new URL(path, VIEWER_SOURCES), "utf8").split("\n");
    const offending = lines
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(({ text }) => LITERAL_COLOUR.test(text));
    expect(offending).toEqual([]);
  });
});
