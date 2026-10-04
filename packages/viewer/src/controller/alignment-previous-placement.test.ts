import { describe, expect, it } from "vitest";
import { jointOf } from "../diagram/diagram-fixtures.ts";
import { restorableOf } from "../previous-placement.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { applyAlignment, setAlignmentFixedJoint } from "./alignment-actions.ts";
import { alignmentStore, PANTIN, pickBoth } from "./alignment-test-helpers.ts";

// An alignment is a placement edit that can be restored (ADR 0039 point 11).

describe("alignment and the previous placement", () => {
  it("keeps the placement before the alignment, with the anchor it had", async () => {
    const { store, aligned } = alignmentStore();
    await pickBoth(store);
    await applyAlignment(store);
    expect(aligned).toHaveLength(1);
    expect(store.state.previousPlacements.get("block")).toEqual({
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      anchor: null,
    });
    expect(restorableOf(store.state, "block").kind).toBe("ready");
  });

  it("is not offered after an alignment that created a fixed joint", async () => {
    const { store, joints } = alignmentStore();
    await pickBoth(store);
    setAlignmentFixedJoint(store, true);
    await applyAlignment(store);
    expect(joints).toHaveLength(1);
    // The core now answers with the joint that anchors "block" to "a".
    const joint = { ...jointOf("link", "block", "fixed"), parent: "frame" };
    const linked = { ...PANTIN, document: { ...PANTIN.document, joints: [joint] } };
    store.state = withOpenPantin(store.state, linked as typeof PANTIN);
    expect(restorableOf(store.state, "block").kind).toBe("anchorChanged");
  });
});
