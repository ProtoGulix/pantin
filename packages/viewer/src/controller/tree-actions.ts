import { parseNodeId } from "../tree/node-ids.ts";
import { withExpanded, withSelectedNode } from "../tree/tree-state.ts";
import { openPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Tree interactions: expansion, activation, framing. Expanding a closed
// Pantin opens it: its folders only exist once the core sent its document.

function isClosedPantin(store: ViewerStore, nodeId: string): string | null {
  const ref = parseNodeId(nodeId);
  return ref?.kind === "pantin" && store.state.openPantin?.id !== ref.pantinId
    ? ref.pantinId
    : null;
}

export async function setExpanded(
  store: ViewerStore,
  nodeId: string,
  expanded: boolean,
): Promise<void> {
  const closedPantinId = isClosedPantin(store, nodeId);
  if (expanded && closedPantinId !== null) {
    await openPantin(store, closedPantinId);
    return;
  }
  store.update(withExpanded(store.state, nodeId, expanded));
}

/** Enter or double-click without rename: open a Pantin, fold or unfold the rest. */
export async function activateNode(store: ViewerStore, nodeId: string): Promise<void> {
  store.update(withSelectedNode(store.state, nodeId));
  const closedPantinId = isClosedPantin(store, nodeId);
  if (closedPantinId !== null) {
    await openPantin(store, closedPantinId);
    return;
  }
  store.update(withExpanded(store.state, nodeId, !store.state.expandedNodeIds.has(nodeId)));
}

export function startRename(store: ViewerStore, nodeId: string): void {
  const kind = parseNodeId(nodeId)?.kind;
  if (kind === "pantin" || kind === "body") {
    store.update({
      ...withSelectedNode(store.state, nodeId),
      renamingNodeId: nodeId,
      contextMenu: null,
    });
  }
}

/** Frames the bodies a node stands for: one body, or the whole open Pantin. */
export async function frameNode(store: ViewerStore, nodeId: string): Promise<void> {
  const ref = parseNodeId(nodeId);
  if (ref === null) {
    return;
  }
  if (store.state.openPantin?.id !== ref.pantinId) {
    // Once opened, the viewport frames every loaded body by itself.
    await openPantin(store, ref.pantinId);
    return;
  }
  const bodyIds = ref.kind === "body" || ref.kind === "sourceNode" ? [ref.bodyId] : null;
  store.ports.viewport().frameBodies(bodyIds);
}
