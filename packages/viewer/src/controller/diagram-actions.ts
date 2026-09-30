import { treeNodeForDiagramNode } from "../diagram/diagram-selection.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The chain diagram (ADR 0029): the switch with the 3D view, folding a band,
// and clicking a node. Display state only; nothing is sent to the core.

export function setDiagramShown(store: ViewerStore, shown: boolean): void {
  if (store.state.diagramShown !== shown) {
    store.update({ ...store.state, diagramShown: shown, contextMenu: null });
  }
}

export function toggleDiagram(store: ViewerStore): void {
  setDiagramShown(store, !store.state.diagramShown);
}

export function toggleDiagramBand(store: ViewerStore, bandKey: string): void {
  const collapsedDiagramBands = new Set(store.state.collapsedDiagramBands);
  if (!collapsedDiagramBands.delete(bandKey)) {
    collapsedDiagramBands.add(bandKey);
  }
  store.update({ ...store.state, collapsedDiagramBands });
}

/**
 * Selects the closest tree row (treeNodeForDiagramNode says which) and keeps
 * the clicked node, so that the 3D view tints the bodies moved downstream of it.
 */
export function selectDiagramNode(store: ViewerStore, diagramNodeId: string): void {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const treeNodeId = treeNodeForDiagramNode(open.document, open.id, diagramNodeId);
  store.update({
    ...withRevealedNode(store.state, treeNodeId),
    diagramNodeId,
    contextMenu: null,
  });
}

export function diagramIntents(store: ViewerStore) {
  return {
    setDiagramShown: (shown: boolean) => setDiagramShown(store, shown),
    toggleDiagramBand: (bandKey: string) => toggleDiagramBand(store, bandKey),
    selectDiagramNode: (nodeId: string) => selectDiagramNode(store, nodeId),
  };
}
