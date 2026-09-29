import { describe, expect, it } from "vitest";
import { pantinResponse, pantinSummaries, stepBody } from "./test-fixtures.ts";
import { bodyNodeId, folderNodeId, pantinNodeId, sourceNodeNodeId } from "./tree/node-ids.ts";
import { nodeExists, withExpanded, withRevealedNode, withSelectedNode } from "./tree/tree-state.ts";
import {
  initialViewerState,
  type ViewerState,
  withImportedBodies,
  withImportFailed,
  withImportStarted,
  withOpenPantin,
} from "./viewer-state.ts";

function listed(): ViewerState {
  return { ...initialViewerState("fr"), pantins: pantinSummaries };
}

describe("withOpenPantin", () => {
  it("expands the newly opened Pantin and its Corps and Liaisons folders, and selects it", () => {
    const state = withOpenPantin(listed(), pantinResponse(false));
    expect([...state.expandedNodeIds]).toEqual([
      pantinNodeId("press"),
      folderNodeId("press", "bodies"),
      folderNodeId("press", "joints"),
    ]);
    expect(state.selectedNodeId).toBe(pantinNodeId("press"));
  });

  it("keeps a selection that still exists after a refresh", () => {
    const opened = withOpenPantin(listed(), pantinResponse(false));
    const selected = withSelectedNode(opened, bodyNodeId("press", "rail"));
    expect(withOpenPantin(selected, pantinResponse(true)).selectedNodeId).toBe(
      bodyNodeId("press", "rail"),
    );
  });

  it("moves the selection to the Pantin when its body disappeared", () => {
    const opened = withOpenPantin(listed(), pantinResponse(false));
    const selected = withSelectedNode(opened, bodyNodeId("press", "rail"));
    expect(withOpenPantin(selected, pantinResponse(false, [])).selectedNodeId).toBe(
      pantinNodeId("press"),
    );
  });

  it("does not re-expand a folder the user collapsed, on a refresh", () => {
    const opened = withOpenPantin(listed(), pantinResponse(false));
    const collapsed = withExpanded(opened, folderNodeId("press", "bodies"), false);
    const refreshed = withOpenPantin(collapsed, pantinResponse(true));
    expect(refreshed.expandedNodeIds.has(folderNodeId("press", "bodies"))).toBe(false);
  });
});

describe("tree state", () => {
  const opened = withOpenPantin(listed(), pantinResponse(false));

  it("knows which nodes exist", () => {
    expect(nodeExists(opened, pantinNodeId("press"))).toBe(true);
    expect(nodeExists(opened, pantinNodeId("robot"))).toBe(false);
    expect(nodeExists(opened, folderNodeId("robot", "bodies"))).toBe(false);
    expect(nodeExists(opened, sourceNodeNodeId("press", "rail", 1))).toBe(true);
    expect(nodeExists(opened, sourceNodeNodeId("press", "rail", 2))).toBe(false);
  });

  it("reveals a source node by expanding every ancestor", () => {
    const collapsed = { ...opened, expandedNodeIds: new Set<string>() };
    const revealed = withRevealedNode(collapsed, sourceNodeNodeId("press", "rail", 0));
    expect([...revealed.expandedNodeIds]).toEqual([
      pantinNodeId("press"),
      folderNodeId("press", "bodies"),
      bodyNodeId("press", "rail"),
    ]);
    expect(revealed.selectedNodeId).toBe(sourceNodeNodeId("press", "rail", 0));
  });

  it("ends a rename when the selection changes", () => {
    const renaming = { ...opened, renamingNodeId: pantinNodeId("press") };
    expect(withSelectedNode(renaming, pantinNodeId("robot")).renamingNodeId).toBeNull();
  });
});

describe("multi-body import", () => {
  const bodies = [stepBody("rail", "3630_0"), stepBody("carriage", "3630_1")];
  const importing = withImportStarted({
    ...withOpenPantin(listed(), pantinResponse(false)),
    pendingImport: { fileName: "3630.step", format: "step", unit: "m", upAxis: "z" },
  });

  it("closes the form and reveals the first imported body in the tree", () => {
    const refreshed = withOpenPantin(importing, pantinResponse(true, bodies));
    const done = withImportedBodies(refreshed, bodies);
    expect(done).toMatchObject({
      importInProgress: false,
      pendingImport: null,
      selectedNodeId: bodyNodeId("press", "rail"),
    });
    expect(done.expandedNodeIds.has(folderNodeId("press", "bodies"))).toBe(true);
  });

  it("keeps the form open, ready to retry, after a failure", () => {
    const failed = withImportFailed(importing);
    expect(failed.importInProgress).toBe(false);
    expect(failed.pendingImport?.fileName).toBe("3630.step");
  });
});
