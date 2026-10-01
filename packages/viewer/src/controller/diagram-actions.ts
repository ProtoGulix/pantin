import { type DeviceRef, deviceExists, deviceOfDiagramNode } from "../device-selection.ts";
import { treeNodeForJointNode } from "../diagram/diagram-selection.ts";
import type { Endpoint } from "../diagram/diagram-wiring.ts";
import { withRevealedNode, withSelection } from "../tree/tree-state.ts";
import {
  createDiagramElement,
  type DiagramElementKind,
  type DiagramHint,
  linkDiagramNodes,
  removeDiagramLink,
  showDiagramHint,
} from "./diagram-edit-actions.ts";
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

/** Selects the device, if the open Pantin still has it (a link of the inspector). */
export function selectDevice(store: ViewerStore, device: DeviceRef): void {
  const open = store.state.openPantin;
  if (open !== null && deviceExists(open.document, device)) {
    // The inspector is the only place a device is shown: selecting one from the
    // diagram or an index opens it. A tree node never does (ADR 0030 point 2).
    store.update({
      ...withSelection(store.state, device),
      inspectorOpen: true,
      contextMenu: null,
    });
  }
}

/**
 * A drive, an actuator or a sensor node selects that device; a joint node
 * selects its tree row (ADR 0030 point 1).
 */
export function selectDiagramNode(store: ViewerStore, diagramNodeId: string): void {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const device = deviceOfDiagramNode(diagramNodeId);
  if (device !== null) {
    selectDevice(store, device);
    return;
  }
  const treeNodeId = treeNodeForJointNode(
    store.chainLinksOf(open.document),
    open.id,
    diagramNodeId,
  );
  if (treeNodeId !== null) {
    store.update({ ...withRevealedNode(store.state, treeNodeId), contextMenu: null });
  }
}

export function diagramIntents(store: ViewerStore) {
  return {
    setDiagramShown: (shown: boolean) => setDiagramShown(store, shown),
    toggleDiagramBand: (bandKey: string) => toggleDiagramBand(store, bandKey),
    selectDiagramNode: (nodeId: string) => selectDiagramNode(store, nodeId),
    linkDiagramNodes: (from: Endpoint, to: Endpoint) => linkDiagramNodes(store, from, to),
    removeDiagramLink: (fromNodeId: string, toNodeId: string) =>
      removeDiagramLink(store, fromNodeId, toNodeId),
    showDiagramHint: (hint: DiagramHint) => showDiagramHint(store, hint),
    createDiagramElement: (kind: DiagramElementKind) => createDiagramElement(store, kind),
  };
}
