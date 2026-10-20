import type { PantinDocument } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import { devicesOfKind, type PendingDeviceDeletion } from "../pending-device-deletion.ts";

// The question for a drive, an actuator or a sensor about to be deleted.

export interface DeviceDeletionQuestion {
  text: string;
  // What the core will refuse, said before it does (a drive that still feeds actuators).
  details?: string[];
}

const TEXT_KEYS: Record<PendingDeviceDeletion["kind"], MessageKey> = {
  drive: "prompt.deleteDrive.text",
  actuator: "prompt.deleteActuator.text",
  sensor: "prompt.deleteSensor.text",
};

function nameOf(document: PantinDocument, device: PendingDeviceDeletion): string | null {
  return devicesOfKind(document, device.kind).find((item) => item.id === device.id)?.name ?? null;
}

/** Null when the device is gone (a discard, another edit): nothing is left to confirm. */
export function deviceDeletionQuestion(
  document: PantinDocument,
  device: PendingDeviceDeletion,
  t: Translate,
): DeviceDeletionQuestion | null {
  const name = nameOf(document, device);
  if (name === null) {
    return null;
  }
  const text = t(TEXT_KEYS[device.kind], { name });
  const fed =
    device.kind === "drive"
      ? document.actuators.filter((actuator) => actuator.feed?.drive === device.id)
      : [];
  if (fed.length === 0) {
    return { text };
  }
  const names = fed.map((actuator) => actuator.name).join(", ");
  return { text, details: [t("prompt.deleteDrive.feeds", { names })] };
}
