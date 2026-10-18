import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AXIS_COLOURS } from "../packages/viewer/src/theme/data-palette.ts";
import { SCENE_PALETTES } from "../packages/viewer/src/theme/scene-palette.ts";
import { COLOUR_BLIND_MATRICES, contrast, simulatedDifference } from "./colour-maths.ts";

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

function registeredPairs(theme: ThemeName): ColourPair[] {
  const scene = SCENE_PALETTES[theme];
  return [
    {
      name: "joint preview parent and child",
      first: scene.jointParent,
      second: scene.selection,
      minDifference: 45,
    },
    ...axesPairs(theme),
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
    pairs.flatMap(
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
