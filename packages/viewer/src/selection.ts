import type { DeviceRef } from "./device-selection.ts";

// What the inspector shows, and the tree, the 3D view and the diagram mark
// (ADR 0030 point 1): a tree node, or a device. A device has a tree row too
// (ADR 0047 point 4), but it stays a device selection, the same value whether
// it comes from the tree, the diagram or the 3D view. One value, so that two
// things are never selected at once.
export type Selection = { kind: "node"; nodeId: string } | DeviceRef;

/** The selection of a tree node, or none for a null id. */
export function nodeSelection(nodeId: string | null): Selection | null {
  return nodeId === null ? null : { kind: "node", nodeId };
}

/** The selected tree node, or null when nothing or a device is selected. */
export function selectedNodeIdOf(selection: Selection | null): string | null {
  return selection?.kind === "node" ? selection.nodeId : null;
}

/**
 * Every selected tree node, the first selected one first. The extra list of the
 * tree's multi-selection counts only while it starts with the selected node:
 * any other change of selection has left it behind.
 */
export function selectedNodeIdsOf(
  selection: Selection | null,
  multiSelectedNodeIds: readonly string[] = [],
): string[] {
  const first = selectedNodeIdOf(selection);
  if (first === null) {
    return [];
  }
  return multiSelectedNodeIds[0] === first ? [...multiSelectedNodeIds] : [first];
}

/** The selected device, or null when nothing or a tree node is selected. */
export function selectedDeviceOf(selection: Selection | null): DeviceRef | null {
  return selection === null || selection.kind === "node" ? null : selection;
}

/** Two selections of the same tree node or the same device. */
export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === "node"
    ? b.kind === "node" && a.nodeId === b.nodeId
    : a.kind === b.kind && a.id === b.id;
}
