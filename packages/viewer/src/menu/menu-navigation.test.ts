import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildMenuBar, type KeyPress, shortcutForKeyPress } from "./menu-model.ts";

const translate = createTranslator("fr");
const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };

function editing(unsavedChanges: boolean): ViewerState {
  return withOpenPantin(listing, pantinResponse(unsavedChanges));
}

function press(key: string, overrides: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inEditableField: false,
    ...overrides,
  };
}

describe("menu bar model navigation", () => {
  it("checks the current language", () => {
    const view = buildMenuBar(listing, translate)[2]?.entries.filter(
      (entry) => entry.type === "item",
    );
    expect(view?.map((entry) => entry.type === "item" && [entry.label, entry.checked])).toEqual([
      ["Tout cadrer", null],
      ["Cadrer la sélection", null],
      ["Inspecteur", true],
      ["Console", false],
      ["Changer la vue centrale", null],
      ["3D seule", false],
      ["Schéma des chaînes seul", false],
      ["3D + Schéma", true],
      ["Perspective", false],
      ["Souris : SolidWorks", true],
      ["Souris : ZW3D", false],
      ["Inverser le sens de la molette", false],
      ["Pas des flèches : 5°", false],
      ["Pas des flèches : 15°", true],
      ["Pas des flèches : 45°", false],
      ["Langue : FR", true],
      ["Langue : EN", false],
    ]);
  });

  it("binds F to Tout cadrer while a Pantin with bodies is open", () => {
    expect(shortcutForKeyPress(editing(false), press("f"))).toMatchObject({
      command: "frameAll",
      run: true,
    });
  });

  it("does not run F while typing, nor with Ctrl (the browser's find)", () => {
    expect(
      shortcutForKeyPress(editing(false), press("f", { inEditableField: true })),
    ).toMatchObject({
      run: false,
    });
    expect(shortcutForKeyPress(editing(false), press("f", { ctrlKey: true }))).toBeNull();
  });

  it("shows F next to Tout cadrer", () => {
    const frameAll = buildMenuBar(editing(false), translate)[2]?.entries.find(
      (entry) => entry.type === "item" && entry.command === "frameAll",
    );
    expect(frameAll).toMatchObject({ shortcutLabel: "F" });
  });
});

describe("menu bar model navigation settings", () => {
  it("checks the preset, the arrow step and the projection of the settings", () => {
    const state = {
      ...listing,
      navigation: { preset: "zw3d", reverseWheel: true, arrowStepDegrees: 45, perspective: true },
    } as const;
    const checked = buildMenuBar(state, translate)[2]?.entries.flatMap((entry) =>
      entry.type === "item" && entry.checked === true ? [entry.command] : [],
    );
    expect(checked).toEqual(
      expect.arrayContaining(["perspective", "navigation:zw3d", "reverseWheel", "arrowStep:45"]),
    );
    expect(checked).not.toContain("navigation:solidworks");
  });
});
