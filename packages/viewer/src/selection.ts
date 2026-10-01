import type { DeviceRef } from "./device-selection.ts";

// What the inspector shows, and the tree, the 3D view and the diagram mark
// (ADR 0030 point 1): a tree node, or a drive, an actuator or a sensor, which
// have no tree row. One value, so that two things are never selected at once.
export type Selection = { kind: "node"; nodeId: string } | DeviceRef;

/** The selection of a tree node, or none for a null id. */
export function nodeSelection(nodeId: string | null): Selection | null {
  return nodeId === null ? null : { kind: "node", nodeId };
}

/** The selected tree node, or null when nothing or a device is selected. */
export function selectedNodeIdOf(selection: Selection | null): string | null {
  return selection?.kind === "node" ? selection.nodeId : null;
}

/** The selected device, or null when nothing or a tree node is selected. */
export function selectedDeviceOf(selection: Selection | null): DeviceRef | null {
  return selection === null || selection.kind === "node" ? null : selection;
}
