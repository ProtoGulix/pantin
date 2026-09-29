import {
  buildJointRequest,
  initialJointForm,
  parseJointType,
  withJointFormType,
  withJointFormValue,
} from "../joints/joint-form.ts";
import { buildJointUpdate } from "../joints/joint-update.ts";
import { describeFailure, errorMessage, infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { withJointDeleted } from "../session-state.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Joint editing: the creation form, deletion and the sliders' requests.
// Like every edit, each one is followed by a fresh read of the Pantin.

export function openJointForm(store: ViewerStore): void {
  const open = store.state.openPantin;
  if (open === null || open.document.bodies.length === 0) {
    return;
  }
  store.update({
    ...store.state,
    jointForm: initialJointForm(open.document.bodies),
    contextMenu: null,
    message: null,
  });
}

export function cancelJointForm(store: ViewerStore): void {
  store.update({ ...store.state, jointForm: null });
}

/**
 * Keeps what the user typed. Deliberately no redraw: the input already shows
 * the value, and a redraw on every key would fight the caret.
 */
export function editJointField(store: ViewerStore, fieldId: string, value: string): void {
  const form = store.state.jointForm;
  if (form !== null) {
    store.state = { ...store.state, jointForm: withJointFormValue(form, fieldId, value) };
  }
}

export function changeJointType(store: ViewerStore, rawType: string): void {
  const form = store.state.jointForm;
  const type = parseJointType(rawType);
  if (form === null) {
    return;
  }
  if (type === null) {
    store.update({ ...store.state, message: errorMessage("message.invalidJointType") });
    return;
  }
  store.update({ ...store.state, jointForm: withJointFormType(form, type) });
}

export async function submitJointForm(store: ViewerStore): Promise<void> {
  const { jointForm: form, openPantin: open } = store.state;
  if (form === null || open === null) {
    return;
  }
  const built = buildJointRequest(form);
  if (!built.ok) {
    // The contract's own message, so the user learns which rule was broken.
    store.update({
      ...store.state,
      message: errorMessage("message.jointInvalid", {}, built.message),
    });
    return;
  }
  const created = await editPantin(store, open.id, (pantinId) =>
    store.ports.api.createJoint(pantinId, built.request),
  );
  // Refused by the core: the message line shows why and the form stays open.
  if (created === undefined) {
    return;
  }
  store.update({
    ...withRevealedNode(store.state, jointNodeId(open.id, created.id)),
    jointForm: null,
    message: infoMessage("message.jointCreated", { name: created.name }),
  });
}

/**
 * Applies one inline edit of a joint: the full request is built from the
 * stored joint, validated, then sent. The joint stays selected (its id never
 * changes) and the bodies move through the pose stream, never here.
 */
export async function updateJointField(
  store: ViewerStore,
  target: Extract<EditTarget, { kind: "jointField" }>,
  text: string,
): Promise<void> {
  const open = store.state.openPantin;
  const joint = open?.document.joints.find((candidate) => candidate.id === target.jointId);
  if (open === null || open.id !== target.pantinId || joint === undefined) {
    return;
  }
  const built = buildJointUpdate(joint, target.fieldId, text);
  if (!built.ok) {
    store.update({
      ...store.state,
      message: errorMessage("message.jointInvalid", {}, built.message),
    });
    return;
  }
  await editPantin(store, open.id, (pantinId) =>
    store.ports.api.updateJoint(pantinId, joint.id, built.request),
  );
}

export async function confirmDeleteJoint(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const joint = open?.document.joints.find(
    (candidate) => candidate.id === store.state.pendingDeleteJointId,
  );
  if (open === null || joint === undefined) {
    return;
  }
  // The answer is the whole Pantin, with unsavedChanges set by the core.
  await store.run(
    () => store.ports.api.deleteJoint(open.id, joint.id),
    (current, response) =>
      store.requestedPantinId === response.id
        ? withJointDeleted(current, response, joint.name)
        : current,
  );
}

/**
 * Asks the core to move a joint (slider drag). No busy indicator and no
 * redraw: dozens of these run during a drag, and the bodies move through the
 * pose stream, never here.
 */
// A value for a Pantin that is no longer open is dropped, not sent to the new one.
export function moveJoint(
  store: ViewerStore,
  pantinId: string,
  jointId: string,
  position: number,
): void {
  if (store.state.openPantin?.id !== pantinId) {
    return;
  }
  store.ports.api.setJointPosition(pantinId, jointId, position).catch((error: unknown) => {
    store.update({ ...store.state, message: describeFailure(error) });
  });
}
