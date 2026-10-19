import {
  type CentralLayout,
  type CentralView,
  chooseView,
  closeBottomZone,
  nextTopView,
  openBottomZone,
  revealView,
  showsIo,
  type Zone,
} from "../central-layout.ts";
import { type DeviceRef, deviceExists, deviceOfDiagramNode } from "../device-selection.ts";
import { treeNodeForJointNode } from "../diagram/diagram-selection.ts";
import type { Endpoint } from "../diagram/diagram-wiring.ts";
import { withRevealedDevice, withRevealedNode } from "../tree/tree-state.ts";
import {
  createDiagramElement,
  type DiagramElementKind,
  type DiagramHint,
  linkDiagramNodes,
  removeDiagramLink,
  showDiagramHint,
} from "./diagram-edit-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The chain diagram (ADR 0029): the layout of the central area, folding a
// band, and clicking a node. Display state only; nothing is sent to the core.

export function setCentralLayout(store: ViewerStore, layout: CentralLayout): void {
  const current = store.state.centralLayout;
  if (current.top !== layout.top || current.bottom !== layout.bottom) {
    store.ports.storeCentralLayout(layout);
    // Showing the I/O view reads the mapping: the store's hook does it (io-load.ts).
    // Entering it is a gesture: a failed read is tried again.
    const io = showsIo(layout) ? { ...store.state.io, failedFor: null } : store.state.io;
    store.update({ ...store.state, centralLayout: layout, contextMenu: null, io });
  }
}

export function chooseZoneView(store: ViewerStore, zone: Zone, view: CentralView): void {
  setCentralLayout(store, chooseView(store.state.centralLayout, zone, view));
}

/** For a link that wants a view on screen, wherever it is: no change when a zone shows it. */
export function revealCentralView(store: ViewerStore, view: CentralView): void {
  setCentralLayout(store, revealView(store.state.centralLayout, view));
}

export function openBottomZoneOf(store: ViewerStore): void {
  setCentralLayout(store, openBottomZone(store.state.centralLayout));
}

export function closeBottomZoneOf(store: ViewerStore): void {
  setCentralLayout(store, closeBottomZone(store.state.centralLayout));
}

export function cycleTopView(store: ViewerStore): void {
  setCentralLayout(store, nextTopView(store.state.centralLayout));
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
    // Its tree row is unfolded so that the selected row is visible (ADR 0047 point 4).
    store.update({
      ...withRevealedDevice(store.state, device),
      inspectorOpen: true,
      contextMenu: null,
    });
  }
}

/**
 * A drive, an actuator or a sensor node selects that device; a joint node
 * selects its tree row (ADR 0030 point 1, ADR 0047 point 4).
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
    chooseZoneView: (zone: Zone, view: CentralView) => chooseZoneView(store, zone, view),
    revealCentralView: (view: CentralView) => revealCentralView(store, view),
    openBottomZone: () => openBottomZoneOf(store),
    closeBottomZone: () => closeBottomZoneOf(store),
    toggleDiagramBand: (bandKey: string) => toggleDiagramBand(store, bandKey),
    selectDiagramNode: (nodeId: string) => selectDiagramNode(store, nodeId),
    linkDiagramNodes: (from: Endpoint, to: Endpoint) => linkDiagramNodes(store, from, to),
    removeDiagramLink: (fromNodeId: string, toNodeId: string) =>
      removeDiagramLink(store, fromNodeId, toNodeId),
    showDiagramHint: (hint: DiagramHint) => showDiagramHint(store, hint),
    createDiagramElement: (kind: DiagramElementKind) => createDiagramElement(store, kind),
  };
}
