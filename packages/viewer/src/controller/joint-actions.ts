import { parseAxisDirection } from "../joints/axis-choice.ts";
import { jointFormFor, jointFormSubmission } from "../joints/joint-edit-form.ts";
import {
  initialJointForm,
  parseJointType,
  withJointAxisDirection,
  withJointAxisReversed,
  withJointFormType,
  withJointFormValue,
} from "../joints/joint-form.ts";
import {
  axisDirectionEdit,
  buildJointUpdate,
  FIELD_AXIS_DIRECTION,
} from "../joints/joint-update.ts";
import { describeFailure, errorMessage, infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { withJointDeleted } from "../session-state.ts";
import { jointNodeId, parseNodeId } from "../tree/node-ids.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Joint editing: the form (creation or type change), deletion and the
// sliders' requests.
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

/** The form prefilled with a stored joint, to change its type (ADR 0018). */
export function openJointEditForm(store: ViewerStore, nodeId: string): void {
  const open = store.state.openPantin;
  const ref = parseNodeId(nodeId);
  const joint =
    ref?.kind === "joint"
      ? open?.document.joints.find((candidate) => candidate.id === ref.jointId)
      : undefined;
  if (joint === undefined) {
    return;
  }
  store.update({
    ...store.state,
    jointForm: jointFormFor(joint),
    contextMenu: null,
    message: null,
  });
}

/**
 * The type row of the properties: the joint form, already on the chosen type.
 * Like "Change type…", it replaces a form left open, whose values are lost.
 */
export function openJointFormWithType(store: ViewerStore, jointId: string, rawType: string): void {
  const joint = store.state.openPantin?.document.joints.find((item) => item.id === jointId);
  const type = parseJointType(rawType);
  if (joint === undefined || type === null || type === joint.type) {
    return;
  }
  store.update({
    ...store.state,
    jointForm: withJointFormType(jointFormFor(joint), type),
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
    store.refreshJointPreview();
  }
}

export function chooseJointAxis(store: ViewerStore, rawDirection: string): void {
  const form = store.state.jointForm;
  const direction = rawDirection === "custom" ? "custom" : parseAxisDirection(rawDirection);
  if (form !== null && direction !== null) {
    store.update({ ...store.state, jointForm: withJointAxisDirection(form, direction) });
  }
}

export function reverseJointAxis(store: ViewerStore): void {
  const form = store.state.jointForm;
  if (form !== null) {
    store.update({ ...store.state, jointForm: withJointAxisReversed(form) });
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
  const submission = jointFormSubmission(form, open.document.joints);
  if (submission.kind === "gone") {
    store.update({ ...store.state, jointForm: null, message: errorMessage("message.jointGone") });
    return;
  }
  if (submission.kind === "invalid") {
    // The contract's own message, so the user learns which rule was broken.
    store.update({
      ...store.state,
      message: errorMessage("message.jointInvalid", {}, submission.message),
    });
    return;
  }
  const saved = await editPantin(store, open.id, (pantinId) =>
    submission.kind === "create"
      ? store.ports.api.createJoint(pantinId, submission.request)
      : store.ports.api.updateJoint(pantinId, submission.jointId, submission.request),
  );
  // Refused by the core: the message line shows why and the form stays open.
  if (saved === undefined) {
    return;
  }
  const messageKey = submission.kind === "create" ? "message.jointCreated" : "message.jointUpdated";
  store.update({
    ...withRevealedNode(store.state, jointNodeId(open.id, saved.id)),
    jointForm: null,
    message: infoMessage(messageKey, { name: saved.name }),
  });
}

function showAxisComponents(store: ViewerStore, jointId: string, shown: boolean): void {
  const jointIds = new Set(store.state.customAxisJointIds);
  if (shown) {
    jointIds.add(jointId);
  } else {
    jointIds.delete(jointId);
  }
  store.update({ ...store.state, customAxisJointIds: jointIds });
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
  if (target.fieldId === FIELD_AXIS_DIRECTION) {
    const { showComponents, send } = axisDirectionEdit(joint, text);
    showAxisComponents(store, joint.id, showComponents);
    if (!send) {
      return;
    }
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
