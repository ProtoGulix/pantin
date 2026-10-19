import type { PantinDocument } from "@pantin/protocol";
import { DEVICE_NAME_FOCUS_KEY, DEVICE_NAME_GROUP } from "../inspector/device-fields.ts";
import {
  nodeSelection,
  type Selection,
  sameSelection,
  selectedDeviceOf,
  selectedNodeIdOf,
  selectedNodeIdsOf,
} from "../selection.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import { withExpanded, withSelection } from "../tree/tree-state.ts";
import { type DeviceIntents, deleteDevice, editDevice } from "../ui/row-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Tree interactions in the edit view: expansion, activation, rename, framing.

export function setExpanded(store: ViewerStore, nodeId: string, expanded: boolean): void {
  store.update(withExpanded(store.state, nodeId, expanded));
}

/** The selection a tree row stands for: a device row selects its device (ADR 0047 point 4). */
function selectionOfRow(nodeId: string): Selection | null {
  const ref = parseNodeId(nodeId);
  return ref?.kind === "device" ? { kind: ref.deviceKind, id: ref.id } : nodeSelection(nodeId);
}

/** A click, or an arrow key, on a row. */
export function selectRow(store: ViewerStore, nodeId: string): void {
  // No redraw when nothing changes, so a double-click lands on the same row element.
  const { selection, contextMenu, renamingNodeId } = store.state;
  const next = selectionOfRow(nodeId);
  if (!sameSelection(selection, next) || contextMenu !== null || renamingNodeId !== null) {
    store.update({ ...withSelection(store.state, next), contextMenu: null });
  }
}

/**
 * Ctrl or Shift on rows (ADR 0055 point 12): the first row is the selection,
 * the others come with it. One row is a plain selection.
 */
export function selectRows(store: ViewerStore, nodeIds: readonly string[]): void {
  const [first] = nodeIds;
  if (first === undefined) {
    return;
  }
  store.update({
    ...withSelection(store.state, selectionOfRow(first)),
    multiSelectedNodeIds: nodeIds.length > 1 ? [...nodeIds] : [],
    contextMenu: null,
  });
}

/**
 * Opens the menu of a row, and selects what the row stands for. A row of the
 * multi-selection keeps it: the menu then acts on all the selected rows.
 */
export function openContextMenu(store: ViewerStore, nodeId: string, x: number, y: number): void {
  if (selectedNodeIdsOf(store.state.selection, store.state.multiSelectedNodeIds).includes(nodeId)) {
    store.update({ ...store.state, contextMenu: { nodeId, x, y } });
    return;
  }
  const selection = selectionOfRow(nodeId);
  store.update({
    ...withSelection(store.state, selection),
    contextMenu: selection === null ? null : { nodeId, x, y },
  });
}

/**
 * A choice in the menu of a device row runs the inspector toolbar's action
 * (ui/row-actions.ts), so there is one logic for both. Edit opens the
 * inspector, where the form is shown; delete asks for no confirmation here,
 * as in the toolbar.
 */
export function runDeviceAction(
  store: ViewerStore,
  intents: DeviceIntents,
  nodeId: string,
  action: "edit" | "delete",
): void {
  const ref = parseNodeId(nodeId);
  if (ref?.kind !== "device") {
    return;
  }
  const device = { kind: ref.deviceKind, id: ref.id };
  const opened = action === "edit" ? { inspectorOpen: true } : {};
  store.update({ ...withSelection(store.state, device), ...opened, contextMenu: null });
  (action === "edit" ? editDevice : deleteDevice)(device, intents);
}

/**
 * Enter or double-click on a node that cannot be renamed: fold or unfold it,
 * or show a device in the inspector.
 */
export function activateNode(store: ViewerStore, nodeId: string): void {
  const next = selectionOfRow(nodeId);
  if (next !== null && next.kind !== "node") {
    // A device has nothing to unfold: activating it shows it in the inspector.
    store.update({ ...withSelection(store.state, next), inspectorOpen: true, contextMenu: null });
    return;
  }
  const selected = withSelection(store.state, nodeSelection(nodeId));
  // An explicit activation shows the node's properties; a single click does not.
  store.update({
    ...withExpanded(selected, nodeId, !selected.expandedNodeIds.has(nodeId)),
    inspectorOpen: true,
  });
}

export function startRename(store: ViewerStore, nodeId: string): void {
  const kind = parseNodeId(nodeId)?.kind;
  if (kind === "pantin" || kind === "body" || kind === "assembly") {
    store.update({
      ...withSelection(store.state, nodeSelection(nodeId)),
      renamingNodeId: nodeId,
      contextMenu: null,
    });
  }
}

/**
 * Renames the selection: a tree node in place, a device in the inspector, which
 * has the only name field there is for it (ADR 0030 point 4). The grid group
 * holding the field is opened, and the inspector with it.
 */
export function renameSelection(store: ViewerStore): void {
  const { selection, inspectorFocus, collapsedPropertyGroups } = store.state;
  const nodeId = selectedNodeIdOf(selection);
  if (selectedDeviceOf(selection) === null) {
    if (nodeId !== null) {
      startRename(store, nodeId);
    }
    return;
  }
  const expanded = new Set(collapsedPropertyGroups);
  expanded.delete(DEVICE_NAME_GROUP);
  store.update({
    ...store.state,
    inspectorOpen: true,
    collapsedPropertyGroups: expanded,
    contextMenu: null,
    inspectorFocus: { key: DEVICE_NAME_FOCUS_KEY, serial: (inspectorFocus?.serial ?? 0) + 1 },
  });
}

// The bodies a node stands for; null frames the whole Pantin. A family folder
// stands for its assembly's bodies.
function bodiesToFrame(ref: NodeRef, document: PantinDocument): string[] | null {
  const assemblyBodies = (key: string) =>
    document.bodies.filter((body) => body.assembly === key).map((body) => body.id);
  switch (ref.kind) {
    case "body":
    case "sourceNode":
      return [ref.bodyId];
    case "assembly":
      return assemblyBodies(ref.key);
    case "family":
      return assemblyBodies(ref.assemblyKey);
    default:
      return null;
  }
}

/** Frames the bodies a node stands for: one body, an assembly, or the whole open Pantin. */
export function frameNode(store: ViewerStore, nodeId: string): void {
  const ref = parseNodeId(nodeId);
  const open = store.state.openPantin;
  if (ref === null || open?.id !== ref.pantinId) {
    return;
  }
  const bodyIds = bodiesToFrame(ref, open.document);
  store.ports.viewport().frameBodies(bodyIds);
}
