import { endpointAssemblyIn, type PantinDocument } from "@pantin/protocol";
import { assemblyChain } from "../assembly-tree.ts";
import { type DeviceRef, deviceExists } from "../device-selection.ts";
import { groupRepresentatives, jointBodyIds } from "../joint-bodies.ts";
import { nodeSelection, type Selection } from "../selection.ts";
import {
  assemblyOfDevice,
  DEVICE_FAMILIES,
  familyHasDevices,
  familyOfKind,
} from "./device-families.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  familyNodeId,
  folderNodeId,
  type NodeRef,
  pantinNodeId,
  parseNodeId,
} from "./node-ids.ts";
import type { TreeSource } from "./tree-model.ts";
import type { TreeViewState } from "./tree-rows.ts";

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
  if (ref.kind === "family") {
    // A folder disappears with its last element.
    const family = DEVICE_FAMILIES.find((candidate) => candidate.key === ref.family);
    return (
      family !== undefined &&
      familyHasDevices(
        { document: source.openPantin.document, language: source.language },
        family,
        ref.assemblyKey,
      )
    );
  }
  if (ref.kind === "device") {
    return deviceExists(source.openPantin.document, { kind: ref.deviceKind, id: ref.id });
  }
  if (ref.kind === "joint") {
    // Listed under a body only while it still holds that body.
    const { underBodyId } = ref;
    const { document } = source.openPantin;
    const representatives = groupRepresentatives(document);
    return document.joints.some((joint) => {
      const ends = jointBodyIds(representatives, joint);
      return (
        joint.id === ref.jointId &&
        (underBodyId === null || ends.parent === underBodyId || ends.child === underBodyId)
      );
    });
  }
  const body = source.openPantin.document.bodies.find((candidate) => candidate.id === ref.bodyId);
  return ref.kind === "body" ? body !== undefined : body?.source.nodes[ref.index] !== undefined;
}

// The assembly nodes holding an assembly, top level first, itself excluded.
function enclosingAssemblyNodes(document: PantinDocument, pantinId: string, key: string): string[] {
  return assemblyChain(document.assemblies, key)
    .slice(0, -1)
    .map((enclosing) => assemblyNodeId(pantinId, enclosing));
}

// Every assembly node from the top level down to the one holding the body.
function assemblyPathOf(document: PantinDocument, pantinId: string, bodyId: string): string[] {
  const key = document.bodies.find((body) => body.id === bodyId)?.assembly;
  return key === undefined
    ? []
    : [...enclosingAssemblyNodes(document, pantinId, key), assemblyNodeId(pantinId, key)];
}

// A joint is listed under its assembly when both bodies share it, otherwise
// in the "between assemblies" folder (tree-model.ts).
function jointContainerOf(document: PantinDocument, pantinId: string, jointId: string): string {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  const parent = joint && endpointAssemblyIn(joint.parent, document.bodies);
  const child = joint && endpointAssemblyIn(joint.child, document.bodies);
  return joint !== undefined && child !== undefined && parent === child
    ? assemblyNodeId(pantinId, child)
    : folderNodeId(pantinId, "betweenAssemblies");
}

// The expansion path to the node listing a joint that holds no body.
function jointContainerPath(document: PantinDocument, pantinId: string, jointId: string): string[] {
  const container = jointContainerOf(document, pantinId, jointId);
  const ref = parseNodeId(container);
  return ref?.kind === "assembly"
    ? [pantinNodeId(pantinId), ...enclosingAssemblyNodes(document, pantinId, ref.key), container]
    : [pantinNodeId(pantinId), container];
}

// The Pantin and every assembly down to the one with the key.
function assemblyPathTo(document: PantinDocument, pantinId: string, key: string): string[] {
  return [
    pantinNodeId(pantinId),
    ...enclosingAssemblyNodes(document, pantinId, key),
    assemblyNodeId(pantinId, key),
  ];
}

// The path to a device row, ending with the folder of its family (ADR 0047
// point 4); just the Pantin when the document no longer has the device.
function devicePath(document: PantinDocument, pantinId: string, device: DeviceRef): string[] {
  const key = assemblyOfDevice(document, device.kind, device.id);
  const family = familyOfKind(device.kind);
  return key === undefined || family === undefined
    ? [pantinNodeId(pantinId)]
    : [...assemblyPathTo(document, pantinId, key), familyNodeId(pantinId, key, family)];
}

/** Nodes to expand so that the node becomes visible, root first. */
function ancestorsOf(ref: NodeRef, document: PantinDocument): string[] {
  const pantin = pantinNodeId(ref.pantinId);
  const holdingAssemblies = (bodyId: string) => assemblyPathOf(document, ref.pantinId, bodyId);
  const bodyPath = (bodyId: string) => [
    pantin,
    ...holdingAssemblies(bodyId),
    bodyNodeId(ref.pantinId, bodyId),
  ];
  switch (ref.kind) {
    case "pantin":
      return [];
    case "folder":
      return [pantin];
    case "assembly":
      return [pantin, ...enclosingAssemblyNodes(document, ref.pantinId, ref.key)];
    case "body":
      return [pantin, ...holdingAssemblies(ref.bodyId)];
    case "joint":
      return ref.underBodyId === null
        ? jointContainerPath(document, ref.pantinId, ref.jointId)
        : bodyPath(ref.underBodyId);
    case "sourceNode":
      return bodyPath(ref.bodyId);
    case "family":
      return assemblyPathTo(document, ref.pantinId, ref.assemblyKey);
    case "device":
      return devicePath(document, ref.pantinId, { kind: ref.deviceKind, id: ref.id });
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

/** Selects a tree node, a device or nothing; any rename in progress ends. */
export function withSelection<State extends TreeViewState>(
  state: State,
  selection: Selection | null,
): State {
  return { ...state, selection, renamingNodeId: null };
}

/** The selected tree node or device is still in the open Pantin. */
export function selectionExists(state: TreeSource & TreeViewState): boolean {
  const { selection } = state;
  const document = state.openPantin?.document;
  if (selection === null || document === undefined) {
    return false;
  }
  return selection.kind === "node"
    ? nodeExists(state, selection.nodeId)
    : deviceExists(document, selection);
}

/** A node whose id changed (a renamed key) keeps its expansion and selection. */
function withNodeIdChanged<State extends TreeViewState>(
  state: State,
  from: string,
  to: string,
): State {
  const rename = (nodeId: string) => (nodeId === from ? to : nodeId);
  const { selection } = state;
  return {
    ...state,
    expandedNodeIds: new Set([...state.expandedNodeIds].map(rename)),
    selection:
      selection?.kind === "node" ? { kind: "node", nodeId: rename(selection.nodeId) } : selection,
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
    selection: before.selection,
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
  return { ...withSelection(state, nodeSelection(nodeId)), expandedNodeIds };
}

/** Selects a device and unfolds the path to its row, e.g. after a click in the diagram or the 3D view. */
export function withRevealedDevice<State extends TreeViewState & TreeSource>(
  state: State,
  device: DeviceRef,
): State {
  const open = state.openPantin;
  if (open === null) {
    return state;
  }
  const expandedNodeIds = new Set([
    ...state.expandedNodeIds,
    ...devicePath(open.document, open.id, device),
  ]);
  return { ...withSelection(state, device), expandedNodeIds };
}
