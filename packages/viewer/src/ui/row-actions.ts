import type { DeviceRef } from "../device-selection.ts";
import type { RowLink, ToggleAction } from "../properties/property-rows.ts";
import type { PanelIntents } from "./panel-intents.ts";

// What the controls of a grid row ask for, as intents. Kept out of the
// components so that the mapping is tested without a page.

type ToggleIntents = Pick<PanelIntents, "toggleBitTag" | "setDriveUnresponsive" | "setJointJammed">;

/** A toggle flips what it shows: a fault is set to the opposite of `on`. */
export function applyToggle(action: ToggleAction, on: boolean, intents: ToggleIntents): void {
  switch (action.kind) {
    case "bitTag":
      intents.toggleBitTag(action.tag);
      return;
    case "driveUnresponsive":
      intents.setDriveUnresponsive(action.driveId, !on);
      return;
    case "jointJammed":
      intents.setJointJammed(action.jointId, !on);
      return;
  }
}

type DeviceIntents = Pick<
  PanelIntents,
  | "openDriveForm"
  | "openActuatorForm"
  | "openSensorForm"
  | "deleteDrive"
  | "deleteActuator"
  | "deleteSensor"
>;

/** The device's form, to change what the grid cannot (its type, its feed). */
export function editDevice(device: DeviceRef, intents: DeviceIntents): void {
  const open = {
    drive: intents.openDriveForm,
    actuator: intents.openActuatorForm,
    sensor: intents.openSensorForm,
  }[device.kind];
  open(device.id);
}

export function deleteDevice(device: DeviceRef, intents: DeviceIntents): void {
  const remove = {
    drive: intents.deleteDrive,
    actuator: intents.deleteActuator,
    sensor: intents.deleteSensor,
  }[device.kind];
  remove(device.id);
}

/** A click on a link row, or Enter on its link: selects what it names. */
export function followLink(
  link: RowLink,
  intents: Pick<PanelIntents, "revealNode" | "selectDevice">,
) {
  if (link.kind === "node") {
    intents.revealNode(link.nodeId);
  } else {
    intents.selectDevice(link.device);
  }
}
