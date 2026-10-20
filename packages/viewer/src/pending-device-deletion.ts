import type { PantinDocument } from "@pantin/protocol";
import type { DeviceRef } from "./device-selection.ts";

/** A drive, an actuator or a sensor waiting for the confirmation of its deletion. */
export interface PendingDeviceDeletion extends DeviceRef {
  kind: "drive" | "actuator" | "sensor";
}

/** The document's list that holds devices of this kind. */
export function devicesOfKind(
  document: PantinDocument,
  kind: PendingDeviceDeletion["kind"],
): readonly { id: string; name: string }[] {
  if (kind === "drive") {
    return document.drives;
  }
  return kind === "actuator" ? document.actuators : document.sensors;
}
