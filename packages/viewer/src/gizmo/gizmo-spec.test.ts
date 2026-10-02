import { describe, expect, it } from "vitest";
import { nodeSelection } from "../selection.ts";
import { pantinResponse, railBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { canUseGizmo, gizmoSpecOf } from "./gizmo-spec.ts";

const open = withOpenPantin(initialViewerState("fr"), pantinResponse(false));
const select = (state: ViewerState, nodeId: string): ViewerState =>
  withSelection(state, nodeSelection(nodeId));
const on: ViewerState = { ...open, gizmoMode: "move" };

describe("the gizmo of a state", () => {
  it("shows for exactly one selected assembly, with the mode and the steps of the state", () => {
    const spec = gizmoSpecOf(select(on, assemblyNodeId("press", "main")));
    expect(spec?.target.assemblyKey).toBe("main");
    expect(spec?.kind).toBe("move");
    expect(spec?.steps).toBe(on.gizmoSteps);
  });

  it("is absent while the gizmo is off", () => {
    expect(gizmoSpecOf(select(open, assemblyNodeId("press", "main")))).toBeNull();
  });

  it("is absent for a body, the Pantin or nothing", () => {
    expect(gizmoSpecOf(select(on, bodyNodeId("press", railBody.id)))).toBeNull();
    expect(gizmoSpecOf(select(on, pantinNodeId("press")))).toBeNull();
    expect(gizmoSpecOf({ ...on, selection: null })).toBeNull();
  });

  it("is absent while the diagram alone covers the 3D view", () => {
    expect(
      gizmoSpecOf({ ...select(on, assemblyNodeId("press", "main")), centralLayout: "diagram" }),
    ).toBeNull();
  });

  it("can be switched on only with an assembly selected", () => {
    expect(canUseGizmo(select(open, assemblyNodeId("press", "main")))).toBe(true);
    expect(canUseGizmo(select(open, bodyNodeId("press", railBody.id)))).toBe(false);
  });
});
