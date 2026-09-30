import { errorMessage, infoMessage } from "../messages.ts";
import { endSwitchRequests, sensorFormForJoint } from "../sensors/joint-sensors.ts";
import {
  buildSensorRequest,
  initialSensorForm,
  parseSensorType,
  sensorFormFor,
  withSensorFormJoint,
  withSensorFormType,
  withSensorFormValue,
} from "../sensors/sensor-form.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The sensors of the right-hand panel (ADR 0023): the sensor form, deletion,
// and the end-of-stroke switches a joint's context menu adds.

export function openSensorForm(store: ViewerStore, sensorId: string | null): void {
  const document = store.state.openPantin?.document;
  if (document === undefined) {
    return;
  }
  const sensor = document.sensors.find((candidate) => candidate.id === sensorId);
  const sensorForm =
    sensor === undefined ? initialSensorForm(document) : sensorFormFor(sensor, document);
  store.update({ ...store.state, drivePanelOpen: true, sensorForm, message: null });
}

/** Opens the panel on a new sensor watching the joint of this tree node. */
export function openSensorFormForJoint(store: ViewerStore, nodeId: string): void {
  const ref = parseNodeId(nodeId);
  const document = store.state.openPantin?.document;
  const sensorForm =
    ref?.kind === "joint" && document !== undefined
      ? sensorFormForJoint(document, ref.jointId)
      : null;
  if (sensorForm !== null) {
    store.update({
      ...store.state,
      drivePanelOpen: true,
      sensorForm,
      contextMenu: null,
      message: null,
    });
  }
}

export function cancelSensorForm(store: ViewerStore): void {
  store.update({ ...store.state, sensorForm: null });
}

// Typing keeps the text without a redraw: the input already shows it.
export function editSensorName(store: ViewerStore, name: string): void {
  const form = store.state.sensorForm;
  if (form !== null) {
    store.state = { ...store.state, sensorForm: { ...form, name } };
  }
}

export function editSensorParameter(store: ViewerStore, key: string, text: string): void {
  const form = store.state.sensorForm;
  if (form !== null) {
    store.state = { ...store.state, sensorForm: withSensorFormValue(form, key, text) };
  }
}

export function changeSensorType(store: ViewerStore, raw: string): void {
  const form = store.state.sensorForm;
  const type = parseSensorType(raw);
  if (form !== null && type !== null) {
    store.update({ ...store.state, sensorForm: withSensorFormType(form, type) });
  }
}

// Redrawn: the units of the parameters follow the joint (mm or degrees).
export function changeSensorJoint(store: ViewerStore, joint: string): void {
  const form = store.state.sensorForm;
  const document = store.state.openPantin?.document;
  if (form !== null && document !== undefined) {
    store.update({ ...store.state, sensorForm: withSensorFormJoint(form, joint, document) });
  }
}

export function changeSensorAssembly(store: ViewerStore, assembly: string): void {
  const form = store.state.sensorForm;
  if (form !== null) {
    store.update({ ...store.state, sensorForm: { ...form, assembly } });
  }
}

export async function submitSensorForm(store: ViewerStore): Promise<void> {
  const { sensorForm: form, openPantin: open } = store.state;
  if (form === null || open === null) {
    return;
  }
  const built = buildSensorRequest(form, open.document);
  if (!built.ok) {
    store.update({
      ...store.state,
      message: errorMessage("message.sensorInvalid", {}, built.message),
    });
    return;
  }
  const { sensorId } = form;
  const saved = await editPantin(store, open.id, (pantinId) =>
    sensorId === null
      ? store.ports.api.createSensor(pantinId, built.request)
      : store.ports.api.updateSensor(pantinId, sensorId, built.request),
  );
  if (saved !== undefined) {
    const key = sensorId === null ? "message.sensorCreated" : "message.sensorUpdated";
    store.update({
      ...store.state,
      sensorForm: null,
      message: infoMessage(key, { name: saved.name }),
    });
  }
}

// Undone by discarding the unsaved changes, like any edit.
export async function deleteSensor(store: ViewerStore, sensorId: string): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const deleted = await editPantin(store, open.id, (pantinId) =>
    store.ports.api.deleteSensor(pantinId, sensorId),
  );
  if (deleted !== undefined) {
    store.update({ ...store.state, message: infoMessage("message.sensorDeleted") });
  }
}

/**
 * One edit per switch, so that the viewer shows each one the core kept: a
 * failure on the second is reported, and the first stays in the panel.
 */
export async function addEndSwitches(store: ViewerStore, nodeId: string): Promise<void> {
  const ref = parseNodeId(nodeId);
  const open = store.state.openPantin;
  const requests =
    ref?.kind === "joint" && open !== null ? endSwitchRequests(open.document, ref.jointId) : [];
  if (open === null || requests.length === 0) {
    return;
  }
  store.update({ ...store.state, contextMenu: null, drivePanelOpen: true });
  const created = [];
  for (const request of requests) {
    const sensor = await editPantin(store, open.id, (pantinId) =>
      store.ports.api.createSensor(pantinId, request),
    );
    if (sensor === undefined) {
      return;
    }
    created.push(sensor);
  }
  const [lower, upper] = created;
  if (lower !== undefined && upper !== undefined) {
    const names = { lower: lower.name, upper: upper.name };
    store.update({ ...store.state, message: infoMessage("message.endSwitchesCreated", names) });
  }
}
