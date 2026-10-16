import { describe, expect, it } from "vitest";
import { nodeSelection } from "../selection.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { assemblyNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { withPlacementFeedbackRules } from "./tool-rules.ts";

const fields = { x: 1, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const invalid = { pantinId: "press", key: "main", field: "x", text: "abc" } as const;
const draft = { pantinId: "press", key: "main", fields };
const open = withOpenPantin(initialViewerState("fr"), pantinResponse(false));
const kept = {
  ...withSelection(open, nodeSelection(assemblyNodeId("press", "main"))),
  placementInvalid: invalid,
  placementDraft: draft,
};

describe("placement field feedback", () => {
  it("stays while its assembly is selected", () => {
    expect(withPlacementFeedbackRules(kept)).toBe(kept);
  });

  it("goes when the selection leaves the assembly", () => {
    const left = withPlacementFeedbackRules(
      withSelection(kept, nodeSelection(assemblyNodeId("press", "other"))),
    );
    expect(left.placementInvalid).toBeNull();
    expect(left.placementDraft).toBeNull();
  });

  it("goes when another Pantin opens", () => {
    const other = withOpenPantin(kept, { ...pantinResponse(false), id: "other" });
    expect(other.placementInvalid).toBeNull();
    expect(other.placementDraft).toBeNull();
  });
});
