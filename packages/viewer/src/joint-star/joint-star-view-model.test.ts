import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { type CentralLayout, layoutOf } from "../central-layout.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { starDocument } from "./joint-star-fixtures.ts";
import { treeNodeIdOfStarNode } from "./joint-star-ids.ts";
import { createJointStarModelBuilder } from "./joint-star-view-model.ts";

const document = starDocument({
  assemblies: ["a"],
  bodies: [
    ["p", "a"],
    ["q", "a"],
  ],
  joints: [{ id: "j", parent: bodyEndpoint("p"), child: bodyEndpoint("q") }],
});

function stateWith(layout: CentralLayout) {
  const open = { ...pantinResponse(false), id: "press", document };
  return { ...withOpenPantin(initialViewerState("en", layout), open) };
}

describe("the joint star model", () => {
  it("is hidden unless a joint layout is chosen and a Pantin is open", () => {
    const build = createJointStarModelBuilder();
    expect(build(stateWith(layoutOf("3d", "diagram")))).toEqual({ shown: false });
    expect(build(initialViewerState("en", layoutOf("joints")))).toEqual({ shown: false });
  });

  it("says whether the 3D view is shown too, for Enter", () => {
    const build = createJointStarModelBuilder();
    const alone = build(stateWith(layoutOf("joints")));
    const together = build(stateWith(layoutOf("3d", "joints")));
    expect(alone.shown && alone.viewportShown).toBe(false);
    expect(together.shown && together.viewportShown).toBe(true);
  });

  it("keeps the layout function while the document is the same, so the view does not redraw", () => {
    const build = createJointStarModelBuilder();
    const state = stateWith(layoutOf("joints"));
    const first = build(state);
    const second = build({ ...state });
    expect(first.shown && second.shown && first.layoutFor === second.layoutFor).toBe(true);
  });

  it("gives the same layout for the same fold and another one when a node unfolds", () => {
    const build = createJointStarModelBuilder();
    const model = build(stateWith(layoutOf("joints")));
    if (!model.shown) {
      throw new Error("expected a shown model");
    }
    const folded = model.layoutFor(new Set());
    expect(model.layoutFor(new Set())).toBe(folded);
    expect(model.layoutFor(new Set(["world"]))).not.toBe(folded);
  });

  it("marks the selection in the layout it is given", () => {
    const build = createJointStarModelBuilder();
    const model = build(stateWith(layoutOf("joints")));
    if (!model.shown) {
      throw new Error("expected a shown model");
    }
    // The Pantin row is selected on opening: World is the selected node.
    expect([...model.highlightFor(model.layoutFor(new Set())).selectedNodeIds]).toEqual(["world"]);
    expect([...model.selectedTreeIds]).toEqual([treeNodeIdOfStarNode(model.pantinId, "world")]);
  });
});
