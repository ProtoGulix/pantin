import { describe, expect, it } from "vitest";
import { errorMessage } from "./messages.ts";
import { contextEntries } from "./panel/context-menu-model.ts";
import { pantinResponse, pantinSummaries } from "./test-fixtures.ts";
import { bodyNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { withSelectedNode } from "./tree/tree-state.ts";
import { buildPanelView } from "./view-model.ts";
import {
  initialViewerState,
  type ViewerState,
  withImportStarted,
  withOpenPantin,
  withRequestStarted,
} from "./viewer-state.ts";

function opened(unsavedChanges: boolean, language: "fr" | "en" = "fr"): ViewerState {
  return withOpenPantin(
    { ...initialViewerState(language), pantins: pantinSummaries },
    pantinResponse(unsavedChanges),
  );
}

describe("toolbar", () => {
  it("enables save and shows the unsaved dot only with unsaved changes", () => {
    expect(buildPanelView(opened(true)).toolbar).toMatchObject({
      saveEnabled: true,
      hasUnsavedChanges: true,
    });
    expect(buildPanelView(opened(false)).toolbar).toMatchObject({
      saveEnabled: false,
      hasUnsavedChanges: false,
    });
  });

  it("disables save and import while a request is in flight", () => {
    const toolbar = buildPanelView(withRequestStarted(opened(true))).toolbar;
    expect(toolbar).toMatchObject({ saveEnabled: false, importEnabled: false, busy: true });
  });

  it("needs an open Pantin to import, and bodies to frame", () => {
    const empty = buildPanelView(initialViewerState("fr")).toolbar;
    expect(empty).toMatchObject({
      importEnabled: false,
      frameAllEnabled: false,
      frameSelectionEnabled: false,
    });
    expect(buildPanelView(opened(false)).toolbar).toMatchObject({
      importEnabled: true,
      frameAllEnabled: true,
    });
  });

  it("frames the selection only when something is selected", () => {
    const onBody = withSelectedNode(opened(false), bodyNodeId("press", "rail"));
    const nothing = withSelectedNode(opened(false), null);
    expect(buildPanelView(onBody).toolbar.frameSelectionEnabled).toBe(true);
    expect(buildPanelView(nothing).toolbar.frameSelectionEnabled).toBe(false);
  });
});

describe("context menu", () => {
  it("offers import only on a Pantin, deletion only on a body, rename only when possible", () => {
    const pantinId = "press";
    expect(contextEntries({ kind: "pantin", pantinId }, true)).toEqual([
      "rename",
      "frame",
      "importInto",
    ]);
    expect(contextEntries({ kind: "body", pantinId, bodyId: "rail" }, true)).toEqual([
      "rename",
      "frame",
      "delete",
    ]);
    expect(
      contextEntries({ kind: "sourceNode", pantinId, bodyId: "rail", index: 0 }, false),
    ).toEqual(["frame"]);
  });

  it("offers a new joint only on the joints folder, deletion on a joint", () => {
    const pantinId = "press";
    expect(contextEntries({ kind: "folder", pantinId, folder: "joints" }, false)).toEqual([
      "frame",
      "newJoint",
    ]);
    expect(contextEntries({ kind: "folder", pantinId, folder: "bodies" }, false)).toEqual([
      "frame",
    ]);
    expect(contextEntries({ kind: "joint", pantinId, jointId: "hinge" }, false)).toEqual([
      "frame",
      "delete",
    ]);
  });

  it("is translated and titled with the node name", () => {
    const state = {
      ...opened(false),
      contextMenu: { nodeId: pantinNodeId("press"), x: 10, y: 20 },
    };
    const menu = buildPanelView(state).contextMenu;
    expect(menu?.title).toBe("Actions sur « Press »");
    expect(menu?.entries.map((entry) => entry.label)).toEqual([
      "Renommer",
      "Cadrer la vue sur l'élément",
      "Importer dans ce Pantin",
    ]);
  });
});

describe("context menu lifetime", () => {
  it("disappears when its node no longer exists", () => {
    const state = {
      ...opened(false),
      contextMenu: { nodeId: bodyNodeId("press", "ghost"), x: 0, y: 0 },
    };
    expect(buildPanelView(state).contextMenu).toBeNull();
  });
});

describe("import form", () => {
  const withStep = (state: ViewerState): ViewerState => ({
    ...state,
    pendingImport: { fileName: "3630.step", format: "step", unit: "m", upAxis: "z" },
  });

  it("hides the unit for STEP and names the target Pantin", () => {
    const form = buildPanelView(withStep(opened(false))).importForm;
    expect(form).toMatchObject({
      showUnit: false,
      formatLabel: "STEP",
      title: "Import dans « Press »",
    });
  });

  it("shows the conversion message and blocks a second submission", () => {
    const form = buildPanelView(withImportStarted(withStep(opened(false)))).importForm;
    expect(form?.progressMessage).toContain("Conversion STEP en cours");
    expect(form?.canSubmit).toBe(false);
  });
});

describe("message line and language", () => {
  it("translates the stored message in the current language, with its detail", () => {
    const state = {
      ...opened(false, "en"),
      message: errorMessage("message.meshLoad", { name: "Rail" }, "bad file"),
    };
    expect(buildPanelView(state).message).toEqual({
      level: "error",
      levelLabel: "Error",
      text: 'Cannot display body "Rail".',
      detail: "bad file",
    });
  });

  it("feeds the tree rows and the properties from the same selection", () => {
    const view = buildPanelView(withSelectedNode(opened(false), bodyNodeId("press", "rail")));
    expect(view.treeRows.find((row) => row.selected)?.label).toBe("Linear rail");
    expect(view.properties[0]?.rows[0]?.value).toBe("Linear rail");
  });
});

describe("list and edit views", () => {
  const listing: ViewerState = {
    ...initialViewerState("fr"),
    pantins: pantinSummaries,
    listSelectedPantinId: "robot",
  };

  it("shows the Pantin list, and no tree, when no Pantin is open", () => {
    const view = buildPanelView(listing);
    expect(view.mode).toBe("list");
    expect(view.treeRows).toEqual([]);
    expect(view.listRows).toEqual([
      { id: "press", name: "Press", detail: "press · 1 corps", selected: false },
      { id: "robot", name: "Robot", detail: "robot · 4 corps", selected: true },
    ]);
    expect(view.toolbar.openEnabled).toBe(true);
    expect(view.viewportHint).toContain("Ouvrez un Pantin");
  });

  it("shows the tree of the open Pantin, and no list, in the edit view", () => {
    const view = buildPanelView(opened(false));
    expect(view.mode).toBe("edit");
    expect(view.listRows).toEqual([]);
    expect(view.treeRows[0]?.label).toBe("Press");
  });

  it("builds the menu bar from the same state", () => {
    expect(buildPanelView(listing).menus.map((menu) => menu.label)).toEqual([
      "Fichier",
      "Édition",
      "Affichage",
    ]);
  });
});
