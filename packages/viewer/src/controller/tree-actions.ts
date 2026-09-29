import { parseNodeId } from "../tree/node-ids.ts";
import { withExpanded, withSelectedNode } from "../tree/tree-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Tree interactions in the edit view: expansion, activation, rename, framing.

export function setExpanded(store: ViewerStore, nodeId: string, expanded: boolean): void {
  store.update(withExpanded(store.state, nodeId, expanded));
}

/** Enter or double-click on a node that cannot be renamed: fold or unfold it. */
export function activateNode(store: ViewerStore, nodeId: string): void {
  const selected = withSelectedNode(store.state, nodeId);
  store.update(withExpanded(selected, nodeId, !selected.expandedNodeIds.has(nodeId)));
}

export function startRename(store: ViewerStore, nodeId: string): void {
  const kind = parseNodeId(nodeId)?.kind;
  if (kind === "pantin" || kind === "body" || kind === "assembly") {
    store.update({
      ...withSelectedNode(store.state, nodeId),
      renamingNodeId: nodeId,
      contextMenu: null,
    });
  }
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
