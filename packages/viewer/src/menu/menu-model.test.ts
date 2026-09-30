import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { bodyNodeId, sourceNodeNodeId } from "../tree/node-ids.ts";
import { withSelectedNode } from "../tree/tree-state.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  buildMenuBar,
  type KeyPress,
  type MenuCommand,
  shortcutForKeyPress,
} from "./menu-model.ts";

const translate = createTranslator("fr");
const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };

function editing(unsavedChanges: boolean): ViewerState {
  return withOpenPantin(listing, pantinResponse(unsavedChanges));
}

function enabledCommands(state: ViewerState): MenuCommand[] {
  return buildMenuBar(state, translate)
    .flatMap((menu) => menu.entries)
    .flatMap((entry) => (entry.type === "item" && entry.enabled ? [entry.command] : []));
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

describe("menu bar model", () => {
  it("has Fichier, Édition and Affichage with their items and shortcut labels", () => {
    const menus = buildMenuBar(editing(true), translate);
    const file = menus[0]?.entries.flatMap((entry) =>
      entry.type === "item" ? [[entry.label, entry.shortcutLabel]] : [],
    );
    expect(file).toEqual([
      ["Ouvrir…", null],
      ["Enregistrer", "Ctrl+S"],
      ["Importer…", null],
      ["Fermer", null],
    ]);
  });

  it("in the list view, only opens, frames nothing and switches language", () => {
    expect(enabledCommands(listing)).toEqual(["open", "language:fr", "language:en"]);
  });

  it("enables Enregistrer only with unsaved changes", () => {
    expect(enabledCommands(editing(false))).not.toContain("save");
    expect(enabledCommands(editing(true))).toContain("save");
  });

  it("enables Supprimer only on a body, Renommer on a Pantin or a body", () => {
    const onBody = withSelectedNode(editing(false), bodyNodeId("press", "rail"));
    const onSource = withSelectedNode(editing(false), sourceNodeNodeId("press", "rail", 0));
    expect(enabledCommands(onBody)).toEqual(expect.arrayContaining(["rename", "delete"]));
    expect(enabledCommands(onSource)).not.toContain("delete");
    expect(enabledCommands(onSource)).not.toContain("rename");
  });

  it("checks the current language", () => {
    const view = buildMenuBar(listing, translate)[2]?.entries.filter(
      (entry) => entry.type === "item",
    );
    expect(view?.map((entry) => entry.type === "item" && [entry.label, entry.checked])).toEqual([
      ["Tout cadrer", null],
      ["Cadrer la sélection", null],
      ["Panneau des drives", true],
      ["Langue : FR", true],
      ["Langue : EN", false],
    ]);
  });
});

describe("keyboard shortcuts", () => {
  const onBody = withSelectedNode(editing(true), bodyNodeId("press", "rail"));
  const commandOf = (state: ViewerState, keyPress: KeyPress) => {
    const found = shortcutForKeyPress(state, keyPress);
    return found?.run ? found.command : null;
  };

  it("maps Ctrl+S (or Cmd+S), F2 and Suppr to their commands", () => {
    expect(commandOf(onBody, press("s", { ctrlKey: true }))).toBe("save");
    expect(commandOf(onBody, press("S", { metaKey: true }))).toBe("save");
    expect(commandOf(onBody, press("F2"))).toBe("rename");
    expect(commandOf(onBody, press("Delete"))).toBe("delete");
  });

  it("never runs while typing in a field", () => {
    expect(commandOf(onBody, press("Delete", { inEditableField: true }))).toBeNull();
    expect(commandOf(onBody, press("s", { ctrlKey: true, inEditableField: true }))).toBeNull();
  });

  it("does not run a disabled command", () => {
    expect(commandOf(editing(false), press("s", { ctrlKey: true }))).toBeNull();
    expect(commandOf(listing, press("Delete"))).toBeNull();
  });

  it("always blocks the browser's Ctrl+S, even in a field or with Save disabled", () => {
    const inField = shortcutForKeyPress(
      onBody,
      press("s", { ctrlKey: true, inEditableField: true }),
    );
    const disabled = shortcutForKeyPress(editing(false), press("s", { ctrlKey: true }));
    expect(inField).toMatchObject({
      run: false,
      primaryModifier: true,
    });
    expect(disabled).toMatchObject({ run: false, primaryModifier: true });
  });

  it("leaves Suppr and F2 to a text field", () => {
    const inField = shortcutForKeyPress(onBody, press("Delete", { inEditableField: true }));
    expect(inField).toMatchObject({ run: false, primaryModifier: false });
  });

  it("needs the exact modifiers", () => {
    expect(shortcutForKeyPress(onBody, press("s"))).toBeNull();
    expect(shortcutForKeyPress(onBody, press("s", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});
