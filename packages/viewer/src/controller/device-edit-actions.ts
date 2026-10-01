import type { PantinDocument } from "@pantin/protocol";
import {
  actuatorFormFor,
  buildActuatorRequest,
  withActuatorFormValue,
} from "../actuators/actuator-form.ts";
import type { DeviceRef } from "../device-selection.ts";
import { buildDriveRequest, driveFormFor, withDriveFormValue } from "../drives/drive-form.ts";
import type { MessageKey } from "../i18n/translate.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { buildSensorRequest, sensorFormFor, withSensorFormValue } from "../sensors/sensor-form.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// A field of a device committed in the inspector's grid (ADR 0030). The device
// goes through its own form: the typed text is validated and converted to SI by
// the same request builder as the form's, and saved with the same API call.

type FieldEdit = Extract<EditTarget, { kind: "deviceField" }>;

// What a built request needs to be sent, or why it is invalid.
type Prepared =
  | { ok: true; send: (pantinId: string) => Promise<{ name: string }> }
  | { ok: false; invalid: MessageKey; message: string };

// An in-place edit resends the whole device from its form: the other parameters
// go through the form's display rounding (units.ts), exactly as the Edit form
// already does when it is applied.
function prepareDriveEdit(
  store: ViewerStore,
  document: PantinDocument,
  edit: FieldEdit,
  value: string,
): Prepared | null {
  const drive = document.drives.find((candidate) => candidate.id === edit.device.id);
  if (drive === undefined) {
    return null;
  }
  const form = driveFormFor(drive, document);
  const edited =
    edit.fieldId === "name"
      ? { ...form, name: value }
      : withDriveFormValue(form, edit.fieldId, value);
  const built = buildDriveRequest(edited, document);
  return built.ok
    ? {
        ok: true,
        send: (pantinId) => store.ports.api.updateDrive(pantinId, drive.id, built.request),
      }
    : { ok: false, invalid: "message.driveInvalid", message: built.message };
}

function prepareActuatorEdit(
  store: ViewerStore,
  document: PantinDocument,
  edit: FieldEdit,
  value: string,
): Prepared | null {
  const actuator = document.actuators.find((candidate) => candidate.id === edit.device.id);
  if (actuator === undefined) {
    return null;
  }
  const form = actuatorFormFor(actuator, document);
  const edited =
    edit.fieldId === "name"
      ? { ...form, name: value }
      : withActuatorFormValue(form, edit.fieldId, value);
  const built = buildActuatorRequest(edited, document);
  return built.ok
    ? {
        ok: true,
        send: (pantinId) => store.ports.api.updateActuator(pantinId, actuator.id, built.request),
      }
    : { ok: false, invalid: "message.actuatorInvalid", message: built.message };
}

function prepareSensorEdit(
  store: ViewerStore,
  document: PantinDocument,
  edit: FieldEdit,
  value: string,
): Prepared | null {
  const sensor = document.sensors.find((candidate) => candidate.id === edit.device.id);
  if (sensor === undefined) {
    return null;
  }
  const form = sensorFormFor(sensor, document);
  const edited =
    edit.fieldId === "name"
      ? { ...form, name: value }
      : withSensorFormValue(form, edit.fieldId, value);
  const built = buildSensorRequest(edited, document);
  return built.ok
    ? {
        ok: true,
        send: (pantinId) => store.ports.api.updateSensor(pantinId, sensor.id, built.request),
      }
    : { ok: false, invalid: "message.sensorInvalid", message: built.message };
}

const UPDATED: Readonly<Record<DeviceRef["kind"], MessageKey>> = {
  drive: "message.driveUpdated",
  actuator: "message.actuatorUpdated",
  sensor: "message.sensorUpdated",
};

export async function commitDeviceEdit(
  store: ViewerStore,
  edit: FieldEdit,
  value: string,
): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const prepare = {
    drive: prepareDriveEdit,
    actuator: prepareActuatorEdit,
    sensor: prepareSensorEdit,
  }[edit.device.kind];
  const prepared = prepare(store, open.document, edit, value);
  if (prepared === null) {
    return;
  }
  if (!prepared.ok) {
    store.update({ ...store.state, message: errorMessage(prepared.invalid, {}, prepared.message) });
    return;
  }
  const saved = await editPantin(store, open.id, prepared.send);
  if (saved !== undefined) {
    store.update({
      ...store.state,
      message: infoMessage(UPDATED[edit.device.kind], { name: saved.name }),
    });
  }
}
