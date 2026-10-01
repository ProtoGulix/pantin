import { DEVICE_NAME_FOCUS_KEY, DEVICE_NAME_GROUP } from "../inspector/device-fields.ts";
import { nodeSelection, selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { withExpanded, withSelection } from "../tree/tree-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Tree interactions in the edit view: expansion, activation, rename, framing.

export function setExpanded(store: ViewerStore, nodeId: string, expanded: boolean): void {
  store.update(withExpanded(store.state, nodeId, expanded));
}

/** Enter or double-click on a node that cannot be renamed: fold or unfold it. */
export function activateNode(store: ViewerStore, nodeId: string): void {
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

/** Frames the bodies a node stands for: one body, an assembly, or the whole open Pantin. */
export function frameNode(store: ViewerStore, nodeId: string): void {
  const ref = parseNodeId(nodeId);
  const open = store.state.openPantin;
  if (ref === null || open?.id !== ref.pantinId) {
    return;
  }
  const assemblyBodies = (key: string) =>
    open.document.bodies.filter((body) => body.assembly === key).map((body) => body.id);
  const bodyIds =
    ref.kind === "body" || ref.kind === "sourceNode"
      ? [ref.bodyId]
      : ref.kind === "assembly"
        ? assemblyBodies(ref.key)
        : null;
  store.ports.viewport().frameBodies(bodyIds);
}
