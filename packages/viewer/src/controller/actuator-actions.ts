import {
  ACTUATOR_TYPES,
  actuatorFormFor,
  actuatorFormForJoint,
  buildActuatorRequest,
  initialActuatorForm,
  withActuatorFormDrive,
  withActuatorFormJoint,
  withActuatorFormPort,
  withActuatorFormType,
  withActuatorFormValue,
} from "../actuators/actuator-form.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { refreshFaults } from "./drive-commands.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The actuator form of the drives panel (ADR 0028 point 13).

export function openActuatorForm(store: ViewerStore, actuatorId: string | null): void {
  const document = store.state.openPantin?.document;
  if (document === undefined) {
    return;
  }
  const actuator = document.actuators.find((candidate) => candidate.id === actuatorId);
  const actuatorForm =
    actuator === undefined ? initialActuatorForm(document) : actuatorFormFor(actuator, document);
  store.update({ ...store.state, actuatorForm, message: null });
}

/** Opens the panel on the joint's actuator, or on a new actuator moving it. */
export function openActuatorFormForJoint(store: ViewerStore, nodeId: string): void {
  const ref = parseNodeId(nodeId);
  const document = store.state.openPantin?.document;
  const actuatorForm =
    ref?.kind === "joint" && document !== undefined
      ? actuatorFormForJoint(document, ref.jointId)
      : null;
  if (actuatorForm !== null) {
    store.update({
      ...store.state,
      drivePanelOpen: true,
      actuatorForm,
      contextMenu: null,
      message: null,
    });
  }
}

export function cancelActuatorForm(store: ViewerStore): void {
  store.update({ ...store.state, actuatorForm: null });
}

// Typing keeps the text without a redraw: the input already shows it.
export function editActuatorName(store: ViewerStore, name: string): void {
  const form = store.state.actuatorForm;
  if (form !== null) {
    store.state = { ...store.state, actuatorForm: { ...form, name } };
  }
}

export function editActuatorParameter(store: ViewerStore, field: string, text: string): void {
  const form = store.state.actuatorForm;
  if (form !== null) {
    store.state = { ...store.state, actuatorForm: withActuatorFormValue(form, field, text) };
  }
}

export function changeActuatorType(store: ViewerStore, raw: string): void {
  const form = store.state.actuatorForm;
  const document = store.state.openPantin?.document;
  const type = ACTUATOR_TYPES.find((candidate) => candidate === raw);
  if (form !== null && document !== undefined && type !== undefined) {
    store.update({ ...store.state, actuatorForm: withActuatorFormType(form, type, document) });
  }
}

export function changeActuatorAssembly(store: ViewerStore, assembly: string): void {
  const form = store.state.actuatorForm;
  if (form !== null) {
    store.update({ ...store.state, actuatorForm: { ...form, assembly } });
  }
}

export function changeActuatorDrive(store: ViewerStore, driveId: string): void {
  const form = store.state.actuatorForm;
  const document = store.state.openPantin?.document;
  if (form !== null && document !== undefined) {
    const chosen = driveId === "" ? null : driveId;
    store.update({ ...store.state, actuatorForm: withActuatorFormDrive(form, chosen, document) });
  }
}

export function changeActuatorPort(store: ViewerStore, inputPort: string, outputPort: string) {
  const form = store.state.actuatorForm;
  if (form !== null) {
    const actuatorForm = withActuatorFormPort(form, inputPort, outputPort);
    store.update({ ...store.state, actuatorForm });
  }
}

export function toggleActuatorJoint(store: ViewerStore, jointId: string, moved: boolean): void {
  const form = store.state.actuatorForm;
  if (form !== null) {
    store.update({ ...store.state, actuatorForm: withActuatorFormJoint(form, jointId, moved) });
  }
}

export async function submitActuatorForm(store: ViewerStore): Promise<void> {
  const { actuatorForm: form, openPantin: open } = store.state;
  if (form === null || open === null) {
    return;
  }
  const built = buildActuatorRequest(form, open.document);
  if (!built.ok) {
    store.update({
      ...store.state,
      message: errorMessage("message.actuatorInvalid", {}, built.message),
    });
    return;
  }
  const { actuatorId } = form;
  const saved = await editPantin(store, open.id, (pantinId) =>
    actuatorId === null
      ? store.ports.api.createActuator(pantinId, built.request)
      : store.ports.api.updateActuator(pantinId, actuatorId, built.request),
  );
  if (saved !== undefined) {
    const key = actuatorId === null ? "message.actuatorCreated" : "message.actuatorUpdated";
    store.update({
      ...store.state,
      actuatorForm: null,
      message: infoMessage(key, { name: saved.name }),
    });
  }
}

// Undone by discarding the unsaved changes, like any edit.
export async function deleteActuator(store: ViewerStore, actuatorId: string): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const deleted = await editPantin(store, open.id, (pantinId) =>
    store.ports.api.deleteActuator(pantinId, actuatorId),
  );
  if (deleted !== undefined) {
    await refreshFaults(store);
    store.update({ ...store.state, message: infoMessage("message.actuatorDeleted") });
  }
}
