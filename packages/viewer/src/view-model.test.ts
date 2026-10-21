import { describe, expect, it } from "vitest";
import { EMPTY_CLIENT_CONSOLE } from "./console/console-list.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, jointOf } from "./diagram/diagram-fixtures.ts";
import { withImportStarted } from "./import-state.ts";
import { errorMessage, meshLoadMessage } from "./messages.ts";
import { withRequestStarted } from "./request-count.ts";
import { pantinResponse, pantinSummaries, withNode } from "./test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { withRevealedDevice } from "./tree/tree-state.ts";
import { buildPanelView as buildPanelViewWith } from "./view-model.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "./viewer-state.ts";

// The console lines are not what these tests are about.
const buildPanelView = (state: ViewerState) =>
  buildPanelViewWith(state, EMPTY_CLIENT_CONSOLE, false);

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

  it("enables save, without the unsaved dot, when a file changed outside Pantin", () => {
    const state = withOpenPantin(opened(false), {
      ...pantinResponse(false),
      changedOutside: ["io.json"],
    });
    expect(buildPanelView(state).toolbar).toMatchObject({
      saveEnabled: true,
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
    const onBody = withNode(opened(false), bodyNodeId("press", "rail"));
    const nothing = withNode(opened(false), null);
    expect(buildPanelView(onBody).toolbar.frameSelectionEnabled).toBe(true);
    expect(buildPanelView(nothing).toolbar.frameSelectionEnabled).toBe(false);
  });
});

describe("context menu labels", () => {
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
      "Nouvel assemblage",
      "Supprimer les liaisons fixes redondantes…",
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
      showUpAxis: false,
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
      message: meshLoadMessage("Rail", "bad file"),
    };
    expect(buildPanelView(state).message).toEqual({
      level: "error",
      levelLabel: "Error",
      text: 'Cannot display body "Rail".',
      links: [],
      detail: "bad file",
      retryMeshLoad: true,
    });
  });

  it("offers no retry for the other messages", () => {
    const state = { ...opened(false, "en"), message: errorMessage("error.network") };
    expect(buildPanelView(state).message?.retryMeshLoad).toBe(false);
  });

  it("feeds the tree rows and the inspector from the same selection", () => {
    const view = buildPanelView(withNode(opened(false), bodyNodeId("press", "rail")));
    expect(view.treeRows.find((row) => row.selected)?.label).toBe("Linear rail");
    expect(view.inspector.groups[0]?.rows[0]?.value).toBe("Linear rail");
  });

  it("has no properties of its own: the left column is the tree and its notifications", () => {
    expect(Object.keys(buildPanelView(opened(false))).sort()).toEqual([
      "about",
      "console",
      "contextMenu",
      "externalEdit",
      "importForm",
      "inspector",
      "io",
      "language",
      "menus",
      "message",
      "mode",
      "prompt",
      "symbolImport",
      "toolbar",
      "translate",
      "treeRows",
      "viewportHint",
      "welcome",
    ]);
  });
});

describe("list and edit views", () => {
  const listing: ViewerState = {
    ...initialViewerState("fr"),
    pantins: pantinSummaries,
    listSelectedPantinId: "robot",
  };

  it("shows the welcome dialog, and no tree, when no Pantin is open", () => {
    const view = buildPanelView(listing);
    expect(view.mode).toBe("list");
    expect(view.treeRows).toEqual([]);
    expect(view.welcome.visible).toBe(true);
    expect(view.welcome.rows.map((row) => [row.id, row.selected])).toEqual([
      ["robot", true],
      ["press", false],
    ]);
    expect(view.viewportHint).toContain("Ouvrez un Pantin");
  });

  it("shows the tree of the open Pantin, and no welcome dialog, in the edit view", () => {
    const view = buildPanelView(opened(false));
    expect(view.mode).toBe("edit");
    expect(view.welcome.visible).toBe(false);
    expect(view.welcome.rows).toEqual([]);
    expect(view.treeRows[0]?.label).toBe("Press");
  });

  it("builds the menu bar from the same state", () => {
    expect(buildPanelView(listing).menus.map((menu) => menu.label)).toEqual([
      "Fichier",
      "Édition",
      "Affichage",
      "Aide",
    ]);
  });
});

describe("context menu of an assembly (ADR 0019)", () => {
  const menuOf = (state: ViewerState) =>
    buildPanelView({
      ...state,
      contextMenu: { nodeId: assemblyNodeId("press", "main"), x: 0, y: 0 },
    }).contextMenu?.entries.map((entry) => entry.label);

  it("says what hiding and isolating will do, as the screen shows it", () => {
    expect(menuOf(opened(false))).toEqual(
      expect.arrayContaining(["Masquer dans la vue 3D", "Isoler dans la vue 3D"]),
    );
    const hidden = {
      ...opened(false),
      assemblyDisplay: { hiddenAssemblyKeys: new Set(["main"]), isolatedAssemblyKey: null },
    };
    expect(menuOf(hidden)).toContain("Afficher dans la vue 3D");
    const isolated = {
      ...opened(false),
      assemblyDisplay: { hiddenAssemblyKeys: new Set<string>(), isolatedAssemblyKey: "main" },
    };
    expect(menuOf(isolated)).toContain("Afficher tous les assemblages");
  });
});

describe("devices in the tree and the inspector", () => {
  const document = documentOf({
    assemblies: ["main"],
    bodies: [bodyOf("carriage", "main")],
    joints: [jointOf("slide", "carriage")],
    drives: [driveOf("verin1-dist", "main")],
    actuators: [cylinderOf("verin1", "main", "verin1-dist", ["slide"])],
  });
  const onDevice = (language: "fr" | "en") =>
    withRevealedDevice(
      withOpenPantin(initialViewerState(language), { ...pantinResponse(false), document }),
      { kind: "drive", id: "verin1-dist" },
    );

  it("selects the row of a device, unfolded, and marks its related joints", () => {
    const view = buildPanelView(onDevice("fr"));
    expect(view.treeRows.filter((row) => row.selected).map((row) => row.kind)).toEqual(["device"]);
    const related = view.treeRows.filter((row) => row.related);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((row) => row.kind === "joint")).toBe(true);
  });

  it("shows the selected device in the inspector, in both languages", () => {
    const fr = buildPanelView(onDevice("fr")).inspector;
    expect([fr.open, fr.subject, fr.device]).toEqual([
      true,
      "Préactionneur · verin1-dist",
      { kind: "drive", id: "verin1-dist" },
    ]);
    expect(buildPanelView(onDevice("en")).inspector.subject).toBe("Drive · verin1-dist");
  });

  it("marks no related row for a tree node", () => {
    expect(buildPanelView(opened(false)).treeRows.some((row) => row.related)).toBe(false);
  });
});
