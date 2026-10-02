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
      ["Face", null],
      ["Arrière", null],
      ["Gauche", null],
      ["Droite", null],
      ["Dessus", null],
      ["Dessous", null],
      ["Isométrique", null],
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
});

describe("menu bar model Affichage", () => {
  it("shows F next to Tout cadrer", () => {
    const frameAll = buildMenuBar(editing(false), translate)[2]?.entries.find(
      (entry) => entry.type === "item" && entry.command === "frameAll",
    );
    expect(frameAll).toMatchObject({ shortcutLabel: "F" });
  });
});

describe("menu bar model standard views", () => {
  const viewEntries = (state: ViewerState) =>
    buildMenuBar(state, translate)[2]?.entries.filter(
      (entry) => entry.type === "item" && entry.command.startsWith("view:"),
    );

  it("lists the seven views with Ctrl+1 to Ctrl+7 in the SolidWorks order", () => {
    expect(
      viewEntries(editing(false))?.map((entry) => entry.type === "item" && entry.shortcutLabel),
    ).toEqual(["Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7"]);
  });

  it("runs a view on its Ctrl shortcut and blocks the browser's own use of the key", () => {
    expect(shortcutForKeyPress(editing(false), press("5", { ctrlKey: true }))).toEqual({
      command: "view:top",
      primaryModifier: true,
      run: true,
    });
  });

  it("does not run a view without a Pantin open, but still blocks the key", () => {
    expect(shortcutForKeyPress(listing, press("7", { ctrlKey: true }))).toMatchObject({
      command: "view:isometric",
      primaryModifier: true,
      run: false,
    });
  });

  it("enables the views only while the 3D view is shown", () => {
    const diagramOnly = { ...editing(false), centralLayout: "diagram" } as const;
    expect(
      viewEntries(diagramOnly)?.every((entry) => entry.type === "item" && !entry.enabled),
    ).toBe(true);
    expect(
      viewEntries(editing(false))?.every((entry) => entry.type === "item" && entry.enabled),
    ).toBe(true);
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
