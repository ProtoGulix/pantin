import { bodyNodeId, folderNodeId, type NodeRef, pantinNodeId, parseNodeId } from "./node-ids.ts";
import type { TreeSource, TreeViewState } from "./tree-model.ts";

// Pure transitions of the tree's own state (expansion, selection, rename).
// Generic over the full state so that this module does not depend on it.

export function nodeExists(source: TreeSource, nodeId: string): boolean {
  const ref = parseNodeId(nodeId);
  if (ref === null) {
    return false;
  }
  // Only the open Pantin has nodes: the tree starts at it.
  if (source.openPantin?.id !== ref.pantinId) {
    return false;
  }
  if (ref.kind === "pantin" || ref.kind === "folder") {
    return true;
  }
  if (ref.kind === "joint") {
    // Listed under a body only while it still holds that body.
    const { underBodyId } = ref;
    return source.openPantin.document.joints.some(
      (joint) =>
        joint.id === ref.jointId &&
        (underBodyId === null || joint.parent === underBodyId || joint.child === underBodyId),
    );
  }
  const body = source.openPantin.document.bodies.find((candidate) => candidate.id === ref.bodyId);
  return ref.kind === "body" ? body !== undefined : body?.source.nodes[ref.index] !== undefined;
}

/** Nodes to expand so that the node becomes visible, root first. */
function ancestorsOf(ref: NodeRef): string[] {
  const pantin = pantinNodeId(ref.pantinId);
  switch (ref.kind) {
    case "pantin":
      return [];
    case "folder":
      return [pantin];
    case "body":
      return [pantin, folderNodeId(ref.pantinId, "bodies")];
    case "joint":
      return ref.underBodyId === null
        ? [pantin, folderNodeId(ref.pantinId, "joints")]
        : [pantin, folderNodeId(ref.pantinId, "bodies"), bodyNodeId(ref.pantinId, ref.underBodyId)];
    case "sourceNode":
      return [pantin, folderNodeId(ref.pantinId, "bodies"), bodyNodeId(ref.pantinId, ref.bodyId)];
  }
}

export function withExpanded<State extends TreeViewState>(
  state: State,
  nodeId: string,
  expanded: boolean,
): State {
  const expandedNodeIds = new Set(state.expandedNodeIds);
  if (expanded) {
    expandedNodeIds.add(nodeId);
  } else {
    expandedNodeIds.delete(nodeId);
  }
  return { ...state, expandedNodeIds };
}

export function withSelectedNode<State extends TreeViewState>(
  state: State,
  nodeId: string | null,
): State {
  return { ...state, selectedNodeId: nodeId, renamingNodeId: null };
}

/** Selects a node and expands its ancestors, e.g. after a click in the 3D view. */
export function withRevealedNode<State extends TreeViewState>(state: State, nodeId: string): State {
  const ref = parseNodeId(nodeId);
  if (ref === null) {
    return state;
  }
  const expandedNodeIds = new Set([...state.expandedNodeIds, ...ancestorsOf(ref)]);
  return { ...withSelectedNode(state, nodeId), expandedNodeIds };
}
