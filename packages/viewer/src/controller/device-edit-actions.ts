import type { PantinDocument } from "@pantin/protocol";
import {
  actuatorFormFor,
  buildActuatorRequest,
  withActuatorFormValue,
} from "../actuators/actuator-form.ts";
import { conveyorFormOf, withConveyorFormField } from "../conveyors/conveyor-form.ts";
import { isConveyorKind } from "../conveyors/conveyor-kinds.ts";
import { buildConveyorRequest } from "../conveyors/conveyor-request.ts";
import type { DeviceRef } from "../device-selection.ts";
import { buildDriveRequest, driveFormFor, withDriveFormValue } from "../drives/drive-form.ts";
import type { MessageKey } from "../i18n/translate.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { buildSensorRequest, sensorFormFor, withSensorFormValue } from "../sensors/sensor-form.ts";
import { saveConveyor } from "./conveyor-calls.ts";
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

function prepareConveyorEdit(
  store: ViewerStore,
  document: PantinDocument,
  edit: FieldEdit,
  value: string,
): Prepared | null {
  const { kind, id } = edit.device;
  const form = isConveyorKind(kind) ? conveyorFormOf(document, kind, id) : null;
  if (form === null) {
    return null;
  }
  const built = buildConveyorRequest(withConveyorFormField(form, edit.fieldId, value));
  return built.ok
    ? { ok: true, send: (pantinId) => saveConveyor(store, pantinId, built.request, id) }
    : { ok: false, invalid: "message.conveyorInvalid", message: built.message };
}

function updatedKey(kind: DeviceRef["kind"]): MessageKey {
  switch (kind) {
    case "drive":
      return "message.driveUpdated";
    case "actuator":
      return "message.actuatorUpdated";
    case "sensor":
      return "message.sensorUpdated";
    default:
      return `message.${kind}.updated`;
  }
}

function prepareDeviceEdit(
  store: ViewerStore,
  document: PantinDocument,
  edit: FieldEdit,
  value: string,
): Prepared | null {
  switch (edit.device.kind) {
    case "drive":
      return prepareDriveEdit(store, document, edit, value);
    case "actuator":
      return prepareActuatorEdit(store, document, edit, value);
    case "sensor":
      return prepareSensorEdit(store, document, edit, value);
    default:
      return prepareConveyorEdit(store, document, edit, value);
  }
}

export async function commitDeviceEdit(
  store: ViewerStore,
  edit: FieldEdit,
  value: string,
): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const prepared = prepareDeviceEdit(store, open.document, edit, value);
  if (prepared === null) {
    return;
  }
  if (!prepared.ok) {
    store.update({ ...store.state, message: errorMessage(prepared.invalid, {}, prepared.message) });
    return;
  }
  await editPantin(store, open.id, prepared.send, (state, saved) => ({
    ...state,
    message: infoMessage(updatedKey(edit.device.kind), { name: saved.name }),
  }));
}
