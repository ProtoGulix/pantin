import type { IoTagOwner } from "@pantin/protocol";
import type { DeviceRef } from "../device-selection.ts";
import type { Selection } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";

// How a tag owner of the core's answer and the viewer's selection correspond
// (ADR 0049 point 11, ADR 0047 point 4). Pure: the selection model stays one
// value, and a joint is a tree node while a device is a device.

export type OwnerTarget =
  | { kind: "device"; device: DeviceRef }
  | { kind: "joint"; jointId: string };

/** What an owner stands for in the tree; every owner kind has a row or a node. */
export function targetOfOwner(owner: IoTagOwner): OwnerTarget {
  return owner.kind === "joint"
    ? { kind: "joint", jointId: owner.id }
    : { kind: "device", device: { kind: owner.kind, id: owner.id } };
}

/** The owner a device would have, or null for a kind whose elements own no tag. */
export function ownerOfDevice(device: DeviceRef): IoTagOwner | null {
  switch (device.kind) {
    case "drive":
    case "sensor":
    case "emitter":
    case "presenceSensor":
      return { kind: device.kind, id: device.id };
    default:
      // Actuators, belts, guides and absorbers have no tag of their own.
      return null;
  }
}

/** The owner of the selection: a selected device, or a selected joint node. */
export function ownerOfSelection(selection: Selection | null): IoTagOwner | null {
  if (selection === null) {
    return null;
  }
  if (selection.kind !== "node") {
    return ownerOfDevice(selection);
  }
  const ref = parseNodeId(selection.nodeId);
  return ref?.kind === "joint" ? { kind: "joint", id: ref.jointId } : null;
}
