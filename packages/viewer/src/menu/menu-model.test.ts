import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { bodyNodeId, sourceNodeNodeId } from "../tree/node-ids.ts";
import { withSelectedDevice, withSelectedNode } from "../tree/tree-state.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  buildMenuBar,
  type KeyPress,
  listShortcuts,
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
      ["Accueil", null],
      ["Ouvrir…", null],
      ["Enregistrer", "Ctrl+S"],
      ["Importer…", null],
      ["Fermer", null],
    ]);
  });

  it("in the list view, shows the welcome dialog, opens, frames nothing and switches language", () => {
    expect(enabledCommands(listing)).toEqual(["welcome", "open", "language:fr", "language:en"]);
    expect(enabledCommands(editing(false))).not.toContain("welcome");
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
      ["Panneau des préactionneurs, actionneurs et capteurs", true],
      ["Schéma des chaînes", false],
      ["Langue : FR", true],
      ["Langue : EN", false],
    ]);
  });
});

describe("menu bar model on a device", () => {
  it("keeps Supprimer, Renommer and Cadrer la sélection disabled on a device", () => {
    const onDevice = withSelectedDevice(editing(false), { kind: "actuator", id: "c1" });
    expect(enabledCommands(onDevice)).not.toContain("delete");
    expect(enabledCommands(onDevice)).not.toContain("rename");
    expect(enabledCommands(onDevice)).not.toContain("frameSelection");
    expect(
      enabledCommands(withSelectedNode(editing(false), bodyNodeId("press", "rail"))),
    ).toContain("frameSelection");
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

  it("maps F4 to the chain diagram only while a Pantin is open", () => {
    expect(commandOf(onBody, press("F4"))).toBe("toggleDiagram");
    expect(commandOf(listing, press("F4"))).toBeNull();
  });

  it("needs the exact modifiers", () => {
    expect(shortcutForKeyPress(onBody, press("s"))).toBeNull();
    expect(shortcutForKeyPress(onBody, press("s", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("shortcut listing", () => {
  it("names the keys and the action of every shortcut", () => {
    expect(listShortcuts(translate)).toEqual([
      { keys: "Ctrl+S", action: "Enregistrer" },
      { keys: "F2", action: "Renommer" },
      { keys: "Suppr", action: "Supprimer" },
      { keys: "F4", action: "Schéma des chaînes" },
    ]);
  });
});
