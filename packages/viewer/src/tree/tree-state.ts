import type { PantinDocument } from "@pantin/protocol";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  type NodeRef,
  pantinNodeId,
  parseNodeId,
} from "./node-ids.ts";
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
  if (ref.kind === "assembly") {
    return source.openPantin.document.assemblies.some((assembly) => assembly.key === ref.key);
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

// The node of a body's assembly; the Pantin's when the body is unknown.
function assemblyNodeOf(document: PantinDocument, pantinId: string, bodyId: string): string {
  const key = document.bodies.find((body) => body.id === bodyId)?.assembly;
  return key === undefined ? pantinNodeId(pantinId) : assemblyNodeId(pantinId, key);
}

// A joint is listed under its assembly when both bodies share it, otherwise
// in the "between assemblies" folder (tree-model.ts).
function jointContainerOf(document: PantinDocument, pantinId: string, jointId: string): string {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  const parent = joint && document.bodies.find((body) => body.id === joint.parent)?.assembly;
  const child = joint && document.bodies.find((body) => body.id === joint.child)?.assembly;
  return joint !== undefined && parent === child
    ? assemblyNodeOf(document, pantinId, joint.child)
    : folderNodeId(pantinId, "betweenAssemblies");
}

/** Nodes to expand so that the node becomes visible, root first. */
function ancestorsOf(ref: NodeRef, document: PantinDocument): string[] {
  const pantin = pantinNodeId(ref.pantinId);
  const bodyPath = (bodyId: string) => [
    pantin,
    assemblyNodeOf(document, ref.pantinId, bodyId),
    bodyNodeId(ref.pantinId, bodyId),
  ];
  switch (ref.kind) {
    case "pantin":
      return [];
    case "folder":
    case "assembly":
      return [pantin];
    case "body":
      return [pantin, assemblyNodeOf(document, ref.pantinId, ref.bodyId)];
    case "joint":
      return ref.underBodyId === null
        ? [pantin, jointContainerOf(document, ref.pantinId, ref.jointId)]
        : bodyPath(ref.underBodyId);
    case "sourceNode":
      return bodyPath(ref.bodyId);
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

/** A node whose id changed (a renamed key) keeps its expansion and selection. */
function withNodeIdChanged<State extends TreeViewState>(
  state: State,
  from: string,
  to: string,
): State {
  const rename = (nodeId: string) => (nodeId === from ? to : nodeId);
  return {
    ...state,
    expandedNodeIds: new Set([...state.expandedNodeIds].map(rename)),
    selectedNodeId: state.selectedNodeId === null ? null : rename(state.selectedNodeId),
  };
}

/**
 * After an answer that renamed a node (a renamed assembly key), the fresh
 * Pantin no longer has the old node, so the selection fell back: carry the
 * expansion and selection from before the request over to the new id.
 */
export function withTreeStateCarried<State extends TreeViewState>(
  before: TreeViewState,
  next: State,
  from: string,
  to: string,
): State {
  const restored = {
    ...next,
    expandedNodeIds: before.expandedNodeIds,
    selectedNodeId: before.selectedNodeId,
  };
  return withNodeIdChanged(restored, from, to);
}

/** Selects a node and expands its ancestors, e.g. after a click in the 3D view. */
export function withRevealedNode<State extends TreeViewState & TreeSource>(
  state: State,
  nodeId: string,
): State {
  const ref = parseNodeId(nodeId);
  const document = state.openPantin?.document;
  if (ref === null || document === undefined) {
    return state;
  }
  const expandedNodeIds = new Set([...state.expandedNodeIds, ...ancestorsOf(ref, document)]);
  return { ...withSelectedNode(state, nodeId), expandedNodeIds };
}
