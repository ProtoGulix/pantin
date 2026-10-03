import {
  type DiagramEdit,
  type Endpoint,
  linkBetween,
  removalBetween,
} from "../diagram/diagram-wiring.ts";
import type { MessageKey, MessageParameters } from "../i18n/translate.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import { openActuatorForm } from "./actuator-actions.ts";
import { openDriveForm } from "./drive-actions.ts";
import { editPantin } from "./pantin-actions.ts";
import { openSensorForm } from "./sensor-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Editing the chains from the diagram (ADR 0029 points 6 and 7). Every edit is
// the existing update of an actuator or a sensor; the core stays the judge, and
// its refusal shows on the message line like any other edit's.

export type DiagramHint = Extract<MessageKey, `diagram.hint.${string}`>;
export type DiagramElementKind = "drive" | "actuator" | "sensor";

async function applyEdit(store: ViewerStore, edit: DiagramEdit): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const saved =
    edit.kind === "actuator"
      ? await editPantin(store, open.id, (pantinId) =>
          store.ports.api.updateActuator(pantinId, edit.actuatorId, edit.request),
        )
      : await editPantin(store, open.id, (pantinId) =>
          store.ports.api.updateSensor(pantinId, edit.sensorId, edit.request),
        );
  if (saved !== undefined) {
    const key = edit.kind === "actuator" ? "message.actuatorUpdated" : "message.sensorUpdated";
    store.update({ ...store.state, message: infoMessage(key, { name: saved.name }) });
  }
}

// An edit built while another is in flight would start from the document
// before that one and could silently undo it, so it waits (as the forms do).
function busy(store: ViewerStore): boolean {
  if (store.state.pendingRequestCount > 0) {
    showDiagramHint(store, "diagram.hint.busy");
  }
  return store.state.pendingRequestCount > 0;
}

function refuse(store: ViewerStore, refusal: { key: MessageKey; parameters: MessageParameters }) {
  store.update({
    ...store.state,
    message: errorMessage(refusal.key, refusal.parameters),
  });
}

/**
 * A link dropped or chosen from "Relier à…": refused with the reason on the
 * message line, sent, or, when it replaces a whole feed, held for a confirmation.
 */
export function linkDiagramNodes(store: ViewerStore, from: Endpoint, to: Endpoint): void {
  const document = store.state.openPantin?.document;
  if (document === undefined || busy(store)) {
    return;
  }
  const result = linkBetween(document, from, to);
  if (!result.ok) {
    refuse(store, result.refusal);
  } else if (result.confirm !== null) {
    const pendingFeedReplacement = { from, to, replaced: result.confirm };
    // One prompt at a time: the delete prompts would pile up with this one.
    store.update({
      ...store.state,
      pendingFeedReplacement,
      pendingDeleteBodyId: null,
      pendingDeleteJointId: null,
      pendingDeleteAssembly: null,
      contextMenu: null,
      message: null,
    });
  } else {
    void applyEdit(store, result.edit);
  }
}

export function confirmFeedReplacement(store: ViewerStore): void {
  // Busy: keep the held link, so that the prompt can be answered again.
  if (busy(store)) {
    return;
  }
  const pending = store.state.pendingFeedReplacement;
  const document = store.state.openPantin?.document;
  store.update({ ...store.state, pendingFeedReplacement: null });
  if (pending === null || document === undefined) {
    return;
  }
  const result = linkBetween(document, pending.from, pending.to);
  if (result.ok) {
    void applyEdit(store, result.edit);
  } else {
    // The document changed since the drop: say why it no longer works.
    refuse(store, result.refusal);
  }
}

export function cancelFeedReplacement(store: ViewerStore): void {
  store.update({ ...store.state, pendingFeedReplacement: null });
}

/** Removes the link between two nodes; a sensor's link is refused, with the way to move it. */
export function removeDiagramLink(store: ViewerStore, fromNodeId: string, toNodeId: string): void {
  const document = store.state.openPantin?.document;
  if (document === undefined || busy(store)) {
    return;
  }
  const result = removalBetween(document, fromNodeId, toNodeId);
  if (result.ok) {
    void applyEdit(store, result.edit);
  } else {
    refuse(store, result.refusal);
  }
}

export function showDiagramHint(store: ViewerStore, hint: DiagramHint): void {
  store.update({ ...store.state, message: infoMessage(hint) });
}

// The "+" of a column: the panel's creation form, which the panel shows when it is open.
export function createDiagramElement(store: ViewerStore, kind: DiagramElementKind): void {
  store.update({ ...store.state, inspectorOpen: true });
  if (kind === "drive") {
    openDriveForm(store, null);
  } else if (kind === "actuator") {
    openActuatorForm(store, null);
  } else {
    openSensorForm(store, null);
  }
}
