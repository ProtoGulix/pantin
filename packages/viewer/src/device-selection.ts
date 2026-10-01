import type { PantinDocument } from "@pantin/protocol";
import { actuatorNode, driveNode, sensorNode } from "./diagram/diagram-chains.ts";

// The selection is a tree node (selectedNodeId) or one of these devices, never
// both: the tree has no row for a drive, an actuator or a sensor (ADR 0030
// point 1). Pure functions over the document, shared by the tree, the 3D view,
// the diagram and the left-hand panel.

export type DeviceKind = "drive" | "actuator" | "sensor";

export interface DeviceRef {
  kind: DeviceKind;
  id: string;
}

/** True for a drive, an actuator or a sensor, false for a tree node kind. */
export function isDeviceKind(kind: string): kind is DeviceKind {
  return kind === "drive" || kind === "actuator" || kind === "sensor";
}

const NODE_IDS: Readonly<Record<DeviceKind, (id: string) => string>> = {
  drive: driveNode,
  actuator: actuatorNode,
  sensor: sensorNode,
};

/** The diagram node standing for the device. */
export function deviceNodeId(device: DeviceRef): string {
  return NODE_IDS[device.kind](device.id);
}

/** The device a diagram node id stands for, or null for a joint (a tree node). */
export function deviceOfDiagramNode(nodeId: string): DeviceRef | null {
  const separator = nodeId.indexOf(":");
  const kind = nodeId.slice(0, separator);
  const id = nodeId.slice(separator + 1);
  return separator > 0 && isDeviceKind(kind) ? { kind, id } : null;
}

function elementsOf(
  document: PantinDocument,
  kind: DeviceKind,
): readonly { id: string; name: string }[] {
  switch (kind) {
    case "drive":
      return document.drives;
    case "actuator":
      return document.actuators;
    case "sensor":
      return document.sensors;
  }
}

export function deviceExists(document: PantinDocument, device: DeviceRef): boolean {
  return elementsOf(document, device.kind).some((element) => element.id === device.id);
}

/** The name the device carries in the document, or null when it is gone. */
export function deviceName(document: PantinDocument, device: DeviceRef): string | null {
  const found = elementsOf(document, device.kind).find((element) => element.id === device.id);
  return found?.name ?? null;
}

/** The actuators fed by a drive: what must be detached before the drive can go. */
export function actuatorsFedBy(document: PantinDocument, driveId: string): DeviceRef[] {
  return document.actuators
    .filter((actuator) => actuator.feed?.drive === driveId)
    .map((actuator) => ({ kind: "actuator", id: actuator.id }));
}

/**
 * The joints a device drives or watches: a drive those of the actuators it
 * feeds, an actuator its own, a sensor the joint it watches.
 */
export function relatedJointIds(document: PantinDocument, device: DeviceRef): Set<string> {
  switch (device.kind) {
    case "drive":
      return new Set(
        document.actuators
          .filter((actuator) => actuator.feed?.drive === device.id)
          .flatMap((actuator) => actuator.joints),
      );
    case "actuator":
      return new Set(document.actuators.find((a) => a.id === device.id)?.joints ?? []);
    case "sensor": {
      const sensor = document.sensors.find((candidate) => candidate.id === device.id);
      return new Set(sensor === undefined ? [] : [sensor.joint]);
    }
  }
}
