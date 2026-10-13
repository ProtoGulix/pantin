import { describe, expect, it } from "vitest";
import { documentStateTags } from "../tree/device-families.ts";
import { devicePantin } from "../tree/device-fixtures.ts";
import { deviceRowId, familyNodeId } from "../tree/node-ids.ts";
import { withExpanded } from "../tree/tree-state.ts";
import type { PanelView } from "../view-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";

// The panel is redrawn when a sensor's mark flips, not at every poll of the tags.

const pantin = devicePantin();
const [switchTag = ""] = documentStateTags(pantin.document);

function openStore() {
  let panels = 0;
  let lastPanel: PanelView | null = null;
  const store = testStore({}, {}, undefined, {
    renderPanel: (view) => {
      panels += 1;
      lastPanel = view;
    },
  });
  store.requestedPantinId = pantin.id;
  store.update(withOpenPantin(store.state, pantin));
  panels = 0;
  return { store, panels: () => panels, lastPanel: () => lastPanel };
}

describe("showTagRead", () => {
  it("redraws the panel when a mark flips, and not when every mark stays", () => {
    const { store, panels } = openStore();
    store.showTagRead(new Map([[switchTag, 1]]), new Map());
    expect(panels()).toBe(1);
    store.showTagRead(new Map([[switchTag, 0.9]]), new Map());
    expect(panels()).toBe(1);
    store.showTagRead(new Map([[switchTag, 0]]), new Map());
    expect(panels()).toBe(2);
  });

  it("does not show the marks of the previous Pantin after a switch", () => {
    const { store, lastPanel } = openStore();
    store.showTagRead(new Map([[switchTag, 1]]), new Map());
    // Same document, so the same tag names: only the reset can clear the mark.
    const other = { ...pantin, id: "other" };
    store.requestedPantinId = other.id;
    const opened = withOpenPantin(store.state, other);
    store.update(withExpanded(opened, familyNodeId(other.id, "main", "actionChain"), true));
    const row = lastPanel()?.treeRows.find(
      (candidate) => candidate.id === deviceRowId(other.id, "sensor", "end"),
    );
    expect(row?.stateMark).toBeNull();
  });
});
