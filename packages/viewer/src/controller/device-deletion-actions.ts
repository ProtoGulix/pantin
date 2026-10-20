import { withDeviceDeleteRequested } from "../device-deletion-state.ts";
import type { PendingDeviceDeletion } from "../pending-device-deletion.ts";
import { deleteActuator } from "./actuator-actions.ts";
import { deleteDrive } from "./drive-actions.ts";
import { deleteSensor } from "./sensor-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Every way of deleting a drive, an actuator or a sensor (inspector button,
// context menu, Edit > Delete and its key) asks first, like a body or a joint.

export function requestDeviceDelete(store: ViewerStore, device: PendingDeviceDeletion): void {
  store.update(withDeviceDeleteRequested(store.state, device));
}

/** "Supprimer" in the prompt: the existing delete, whose refusals show on the message line. */
export async function confirmDeviceDelete(store: ViewerStore): Promise<void> {
  const device = store.state.pendingDeleteDevice;
  if (device === null) {
    return;
  }
  store.update({ ...store.state, pendingDeleteDevice: null });
  if (device.kind === "drive") {
    await deleteDrive(store, device.id);
  } else if (device.kind === "actuator") {
    await deleteActuator(store, device.id);
  } else {
    await deleteSensor(store, device.id);
  }
}
