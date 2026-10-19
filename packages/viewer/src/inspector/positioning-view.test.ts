import { describe, expect, it } from "vitest";
import { newAlignmentSession } from "../alignment/alignment-session.ts";
import { layoutOf } from "../central-layout.ts";
import { EMPTY_CLIENT_CONSOLE } from "../console/console-list.ts";
import { createTranslator } from "../i18n/translate.ts";
import { nodeSelection } from "../selection.ts";
import { pantinResponse, railBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { buildPanelView } from "../view-model.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildPositioningView } from "./positioning-view.ts";

// The "Positionnement" section (ADR 0039 points 1 and 2).

const t = createTranslator("fr");
const open = withOpenPantin(initialViewerState("fr"), pantinResponse(false));
const select = (state: ViewerState, nodeId: string): ViewerState =>
  withSelection(state, nodeSelection(nodeId));
const assembly = select(open, assemblyNodeId("press", "main"));
const viewOf = (state: ViewerState) => buildPositioningView(state, t, false);
const pressed = (state: ViewerState) =>
  viewOf(state)
    ?.tools.filter((tool) => tool.pressed)
    .map((tool) => tool.command);

describe("positioning of an assembly", () => {
  it("shows the anchor then X, Y, Z, RX, RY, RZ in a titled group", () => {
    const view = viewOf(assembly);
    expect(view?.group?.title).toBe("Position dans le monde");
    expect(view?.group?.rows.map((row) => row.label)).toEqual([
      "Repère",
      "X (mm)",
      "Y (mm)",
      "Z (mm)",
      "RX (°)",
      "RY (°)",
      "RZ (°)",
    ]);
    expect(view?.bodyLine).toBeNull();
  });

  it("presses the tool that is on and shows the step of that gizmo only", () => {
    const moving: ViewerState = { ...assembly, gizmoMode: "move" };
    expect(pressed(moving)).toEqual(["gizmoMove", "gizmoSpace"]);
    expect(viewOf(moving)?.step).toMatchObject({ field: "translationMillimetres" });
    const rotating: ViewerState = { ...assembly, gizmoMode: "rotate" };
    expect(pressed(rotating)).toEqual(["gizmoRotate", "gizmoSpace"]);
    expect(viewOf(rotating)?.step).toMatchObject({
      field: "rotationDegrees",
      value: String(assembly.gizmoSteps.rotationDegrees),
    });
  });

  it("presses Aligner while an alignment is under way", () => {
    const aligning = { ...assembly, alignment: newAlignmentSession("press", "main") };
    expect(pressed(aligning)).toEqual(["gizmoSpace", "align"]);
  });

  it("holds the alignment block only while an alignment is under way", () => {
    expect(viewOf(assembly)?.alignment).toBeNull();
    const aligning = { ...assembly, alignment: newAlignmentSession("press", "main") };
    expect(viewOf(aligning)?.alignment?.kind).toBe("plane_on_plane");
    expect(buildPositioningView(aligning, t, true)?.alignment?.clockNote).not.toBeNull();
  });

  it("disables the tools while the diagram alone hides the 3D view", () => {
    const view = viewOf({ ...assembly, centralLayout: layoutOf("diagram") });
    expect(view?.tools.every((tool) => tool.disabled)).toBe(true);
  });

  it("reflects the folded state of the group", () => {
    const folded = { ...assembly, collapsedPropertyGroups: new Set(["assemblyPlacement"]) };
    expect(viewOf(folded)?.group?.collapsed).toBe(true);
  });
});

describe("edit feedback of the placement fields", () => {
  const rows = (state: ViewerState) => viewOf(state)?.group?.rows ?? [];
  const rowOf = (state: ViewerState, id: string) => rows(state).find((row) => row.id === id);

  it("moves Enter from each field to the next one, and from RZ nowhere", () => {
    const next = rows(assembly).map((row) => row.nextFocusKey);
    expect(next).toEqual([
      undefined,
      "property-placement-y",
      "property-placement-z",
      "property-placement-rx",
      "property-placement-ry",
      "property-placement-rz",
      undefined,
    ]);
  });

  it("keeps the refused text on its row and explains under the group", () => {
    const state: ViewerState = {
      ...assembly,
      placementInvalid: { pantinId: "press", key: "main", field: "y", text: "abc" },
    };
    expect(rowOf(state, "placement-y")?.invalidText).toBe("abc");
    expect(rowOf(state, "placement-x")?.invalidText).toBeUndefined();
    expect(viewOf(state)?.group?.error).toBe("Valeur refusée : tapez un nombre.");
    expect(viewOf(assembly)?.group?.error).toBeUndefined();
  });

  it("shows the dragged placement in display units, marked, for that assembly only", () => {
    const fields = { x: 12.5, y: 0, z: 0, rx: 0, ry: 0, rz: 45 };
    const state: ViewerState = {
      ...assembly,
      placementDraft: { pantinId: "press", key: "main", fields },
    };
    expect(rowOf(state, "placement-x")).toMatchObject({ value: "12.5", dragged: true });
    expect(rowOf(state, "placement-rz")).toMatchObject({ value: "45", dragged: true });
    const elsewhere: ViewerState = {
      ...assembly,
      placementDraft: { pantinId: "press", key: "other", fields },
    };
    expect(rowOf(elsewhere, "placement-x")?.dragged).toBeUndefined();
  });
});

describe("the gizmo axes toggle", () => {
  it("offers the tools, enabled, none pressed but the Local axes", () => {
    expect(viewOf(assembly)?.tools).toEqual([
      { command: "gizmoMove", label: "Déplacer (G)", pressed: false, disabled: false },
      { command: "gizmoRotate", label: "Tourner (R)", pressed: false, disabled: false },
      {
        command: "gizmoSpace",
        label: "Repère local de l'assemblage (L)",
        pressed: true,
        disabled: false,
      },
      { command: "align", label: "Aligner (A)", pressed: false, disabled: false },
    ]);
    expect(viewOf(assembly)?.step).toBeNull();
  });

  it("names the anchor's axes and releases the toggle in Global", () => {
    const global = viewOf({ ...assembly, gizmoSpace: "global" })?.tools;
    expect(global?.find((tool) => tool.command === "gizmoSpace")).toMatchObject({
      label: "Repère du support (L)",
      pressed: false,
    });
  });
});

describe("positioning of a body", () => {
  const body = select(open, bodyNodeId("press", railBody.id));

  it("says which assembly it is placed with, with the three tools", () => {
    const view = viewOf(body);
    expect(view?.group).toBeNull();
    expect(view?.bodyLine).toBe("Se place avec l'assemblage « main »");
    expect(view?.tools.map((tool) => tool.command)).toEqual([
      "gizmoMove",
      "gizmoRotate",
      "gizmoSpace",
      "align",
    ]);
    expect(view?.step).toBeNull();
    expect(view?.alignment).toBeNull();
  });

  it("offers the tools, which act on the body's assembly", () => {
    expect(viewOf(body)?.tools.some((tool) => tool.disabled)).toBe(false);
    const aligning = { ...body, alignment: newAlignmentSession("press", "main") };
    expect(viewOf(aligning)?.tools.map((tool) => tool.disabled)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(viewOf(aligning)?.alignment).not.toBeNull();
  });
});

describe("no positioning", () => {
  it("is absent for the Pantin and for nothing", () => {
    expect(viewOf(select(open, pantinNodeId("press")))).toBeNull();
    expect(viewOf({ ...open, selection: null })).toBeNull();
  });
});

describe("toolbar", () => {
  it("carries no gizmo or alignment field: they are the inspector's", () => {
    const keys = Object.keys(buildPanelView(open, EMPTY_CLIENT_CONSOLE, false).toolbar);
    expect(keys.filter((key) => /gizmo|align/i.test(key))).toEqual([]);
  });
});
