import { describe, expect, it } from "vitest";
import { newAlignmentSession } from "../alignment/alignment-session.ts";
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
const viewOf = (state: ViewerState) => buildPositioningView(state, t);
const pressed = (state: ViewerState) =>
  viewOf(state)
    ?.tools.filter((tool) => tool.pressed)
    .map((tool) => tool.command);

describe("positioning of an assembly", () => {
  it("shows the anchor then X, Y, Z, RX, RY, RZ in a titled group", () => {
    const view = viewOf(assembly);
    expect(view?.group?.title).toBe("Positionnement");
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

  it("offers the three tools, enabled, none pressed", () => {
    expect(viewOf(assembly)?.tools).toEqual([
      { command: "gizmoMove", label: "Déplacer (G)", pressed: false, disabled: false },
      { command: "gizmoRotate", label: "Tourner (R)", pressed: false, disabled: false },
      { command: "align", label: "Aligner (A)", pressed: false, disabled: false },
    ]);
    expect(viewOf(assembly)?.step).toBeNull();
  });

  it("presses the tool that is on and shows the step of that gizmo only", () => {
    const moving: ViewerState = { ...assembly, gizmoMode: "move" };
    expect(pressed(moving)).toEqual(["gizmoMove"]);
    expect(viewOf(moving)?.step).toMatchObject({ field: "translationMillimetres" });
    const rotating: ViewerState = { ...assembly, gizmoMode: "rotate" };
    expect(pressed(rotating)).toEqual(["gizmoRotate"]);
    expect(viewOf(rotating)?.step).toMatchObject({
      field: "rotationDegrees",
      value: String(assembly.gizmoSteps.rotationDegrees),
    });
  });

  it("presses Aligner while an alignment is under way", () => {
    const aligning = { ...assembly, alignment: newAlignmentSession("press", "main") };
    expect(pressed(aligning)).toEqual(["align"]);
  });

  it("disables the tools while the diagram alone hides the 3D view", () => {
    const view = viewOf({ ...assembly, centralLayout: "diagram" });
    expect(view?.tools.every((tool) => tool.disabled)).toBe(true);
  });

  it("reflects the folded state of the group", () => {
    const folded = { ...assembly, collapsedPropertyGroups: new Set(["assemblyPlacement"]) };
    expect(viewOf(folded)?.group?.collapsed).toBe(true);
  });
});

describe("positioning of a body", () => {
  const body = select(open, bodyNodeId("press", railBody.id));

  it("says which assembly it is placed with, with the three tools", () => {
    const view = viewOf(body);
    expect(view?.group).toBeNull();
    expect(view?.bodyLine).toBe("Se place avec l'assemblage « main »");
    expect(view?.tools.map((tool) => tool.command)).toEqual(["gizmoMove", "gizmoRotate", "align"]);
    expect(view?.step).toBeNull();
  });

  it("keeps today's availability: tools off unless an alignment can be stopped", () => {
    expect(viewOf(body)?.tools.every((tool) => tool.disabled)).toBe(true);
    const aligning = { ...body, alignment: newAlignmentSession("press", "main") };
    expect(viewOf(aligning)?.tools.map((tool) => tool.disabled)).toEqual([true, true, false]);
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
    const keys = Object.keys(buildPanelView(open, EMPTY_CLIENT_CONSOLE).toolbar);
    expect(keys.filter((key) => /gizmo|align/i.test(key))).toEqual([]);
  });
});
