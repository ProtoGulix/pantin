import { describe, expect, it } from "vitest";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { withSelectedNode } from "../tree/tree-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { selectDiagramNode, setDiagramShown, toggleDiagramBand } from "./diagram-actions.ts";
import { refreshTagValues } from "./drive-commands.ts";

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);

function openStore(listTags = async () => ({ stepCount: 0, tags: [], drives: [] })) {
  const store = testStore({ listTags });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), drivePanelOpen: false });
  return store;
}

describe("the diagram state", () => {
  it("shows and hides the diagram, and folds a band and unfolds it", () => {
    const store = openStore();
    setDiagramShown(store, true);
    expect(store.state.diagramShown).toBe(true);
    toggleDiagramBand(store, "main");
    expect([...store.state.collapsedDiagramBands]).toEqual(["main"]);
    toggleDiagramBand(store, "main");
    expect(store.state.collapsedDiagramBands.size).toBe(0);
    setDiagramShown(store, false);
    expect(store.state.diagramShown).toBe(false);
  });

  it("selects the closest tree row and keeps the clicked node", () => {
    const store = openStore();
    selectDiagramNode(store, `joint:${slideJoint.id}`);
    expect(store.state.diagramNodeId).toBe(`joint:${slideJoint.id}`);
    expect(store.state.selectedNodeId).toBe(
      jointNodeId(pantin.id, slideJoint.id, slideJoint.child),
    );
  });
});

describe("refreshTagValues with the diagram", () => {
  it("reads the tags while the diagram is shown, although no panel and no sensor asks", async () => {
    let reads = 0;
    const store = openStore(async () => {
      reads += 1;
      return { stepCount: 0, tags: [], drives: [] };
    });
    await refreshTagValues(store);
    expect(reads).toBe(0);
    setDiagramShown(store, true);
    await refreshTagValues(store);
    expect(reads).toBe(1);
  });
});

describe("selection memory", () => {
  it("forgets the clicked diagram node when the tree selects a row", () => {
    const store = openStore();
    selectDiagramNode(store, `joint:${slideJoint.id}`);
    expect(store.state.diagramNodeId).not.toBeNull();
    store.update(withSelectedNode(store.state, bodyNodeId(pantin.id, "carriage")));
    expect(store.state.diagramNodeId).toBeNull();
    // Selecting the joint row again does not bring the old diagram selection back.
    store.update(
      withSelectedNode(store.state, jointNodeId(pantin.id, slideJoint.id, slideJoint.child)),
    );
    expect(store.state.diagramNodeId).toBeNull();
  });
});

describe("the viewport follows the switch", () => {
  it("renders in 3D and stops rendering while the diagram is shown", () => {
    const calls: boolean[] = [];
    const store = testStore({}, { setRendering: (active: boolean) => calls.push(active) });
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    setDiagramShown(store, true);
    setDiagramShown(store, false);
    expect(calls.slice(-3)).toEqual([true, false, true]);
  });

  it("keeps rendering with no Pantin open, whatever the switch says", () => {
    const calls: boolean[] = [];
    const store = testStore({}, { setRendering: (active: boolean) => calls.push(active) });
    store.update({ ...store.state, diagramShown: true });
    expect(calls).toEqual([true]);
  });
});
