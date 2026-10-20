import { isBridgeActive } from "../bridge/bridge-model.ts";
import type { PromptAction } from "../panel/prompt-model.ts";
import { withRedundantJointsCancelled } from "../redundant-joints-state.ts";
import {
  withBodyDeleted,
  withCloseCancelled,
  withCloseRequested,
  withCloseStopsBridge,
  withDeleteCancelled,
  withDeleteRequested,
  withEditsDiscarded,
  withOrphanCleanupCancelled,
  withPantinClosed,
} from "../session-state.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import {
  confirmDeleteAssembly,
  deleteAssembly,
  requestAssemblyDeletion,
} from "./assembly-actions.ts";
import { stopBridge } from "./bridge-actions.ts";
import { cancelFeedReplacement, confirmFeedReplacement } from "./diagram-edit-actions.ts";
import { cancelGroup, confirmGroup } from "./grouping-actions.ts";
import { confirmDeleteJoint } from "./joint-actions.ts";
import { confirmOrphanCleanup } from "./orphan-cleanup-actions.ts";
import { refreshPantinList, savePantin } from "./pantin-actions.ts";
import { confirmRedundantJointsDeletion } from "./redundant-joints-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Moving between the list and edit views, and deleting a body, with their
// inline confirmations.

function closeNow(store: ViewerStore): void {
  // Answers still on their way for the closed Pantin must be ignored.
  store.requestedPantinId = null;
  store.pendingImportFile = null;
  store.update(withPantinClosed(store.state));
  void refreshPantinList(store);
}

/** Fichier > Fermer / Ouvrir…, the back button: closes, or asks first if unsaved. */
export function requestClose(store: ViewerStore): void {
  const next = withCloseRequested(store.state, isBridgeActive(store.bridgeModel));
  if (next.openPantin === null && store.state.openPantin !== null) {
    closeNow(store);
    return;
  }
  store.update(next);
}

async function confirmDelete(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const bodyId = store.state.pendingDeleteBodyId;
  const body = open?.document.bodies.find((candidate) => candidate.id === bodyId);
  if (open === null || body === undefined) {
    return;
  }
  await store.run(
    () => store.ports.api.deleteBody(open.id, body.id),
    (current, response) =>
      store.requestedPantinId === response.id
        ? withBodyDeleted(current, response, body.name)
        : current,
  );
}

// The box "Also stop the bridge" of the close prompt: the stop is sent before
// anything else, and a refusal leaves the prompt open with the error shown.
async function stopBridgeIfAsked(store: ViewerStore): Promise<boolean> {
  const { closeBridgeNotice, closeStopsBridge } = store.state;
  return !(closeBridgeNotice && closeStopsBridge) || (await stopBridge(store));
}

export function setCloseStopsBridge(store: ViewerStore, stops: boolean): void {
  store.update(withCloseStopsBridge(store.state, stops));
}

// "Ne pas enregistrer": the core must really drop the edits before the view
// closes; on failure the prompt stays and the message line shows why.
async function discardThenClose(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null || !(await stopBridgeIfAsked(store))) {
    return;
  }
  const discarded = await store.run(
    () => store.ports.api.discardPantin(open.id),
    (current, saved) => withEditsDiscarded(current, saved),
  );
  if (discarded !== undefined) {
    store.requestedPantinId = null;
    store.pendingImportFile = null;
    void refreshPantinList(store);
  }
}

// The bridge is stopped first: if the core refuses, the prompt stays and the
// message line says why, instead of leaving a bridge nobody can reach.
async function stopBridgeThenClose(store: ViewerStore): Promise<void> {
  if (await stopBridge(store)) {
    closeNow(store);
  }
}

async function saveThenClose(store: ViewerStore): Promise<void> {
  if (!(await stopBridgeIfAsked(store))) {
    return;
  }
  store.update(withCloseCancelled(store.state));
  if (await savePantin(store)) {
    closeNow(store);
  }
}

function confirmPendingDelete(store: ViewerStore): Promise<void> {
  if (store.state.pendingDeleteAssembly !== null) {
    return confirmDeleteAssembly(store);
  }
  return store.state.pendingDeleteJointId === null
    ? confirmDelete(store)
    : confirmDeleteJoint(store);
}

// The prompts that follow an edit command; the close and delete prompts are
// in resolvePrompt.
function resolveEditPrompt(store: ViewerStore, action: PromptAction): void {
  switch (action) {
    case "confirmOrphanCleanup":
      void confirmOrphanCleanup(store);
      return;
    case "cancelOrphanCleanup":
      store.update(withOrphanCleanupCancelled(store.state));
      return;
    case "confirmRedundantJoints":
      void confirmRedundantJointsDeletion(store);
      return;
    case "cancelRedundantJoints":
      store.update(withRedundantJointsCancelled(store.state));
      return;
    case "confirmReplaceFeed":
      confirmFeedReplacement(store);
      return;
    case "cancelReplaceFeed":
      cancelFeedReplacement(store);
      return;
    case "confirmGroup":
      void confirmGroup(store);
      return;
    case "cancelGroup":
      cancelGroup(store);
      return;
    default:
      return;
  }
}

export function resolvePrompt(store: ViewerStore, action: PromptAction): void {
  switch (action) {
    case "saveAndClose":
      void saveThenClose(store);
      return;
    case "discardAndClose":
      void discardThenClose(store);
      return;
    case "stopBridgeAndClose":
      void stopBridgeThenClose(store);
      return;
    case "closeKeepingBridge":
      closeNow(store);
      return;
    case "cancelClose":
      store.update(withCloseCancelled(store.state));
      return;
    case "confirmDelete":
      void confirmPendingDelete(store);
      return;
    case "cancelDelete":
      store.update(withDeleteCancelled(store.state));
      return;
    default:
      resolveEditPrompt(store, action);
  }
}

export function requestDelete(store: ViewerStore, nodeId: string): void {
  const ref = parseNodeId(nodeId);
  if (ref?.kind === "assembly") {
    void deleteAssemblyNode(store, ref.pantinId, ref.key);
    return;
  }
  store.update(withDeleteRequested(store.state, nodeId));
}

// An empty assembly (no body, drive, actuator or sensor) goes at once; any
// other asks the core what the deletion would remove (ADR 0037 point 7).
function deleteAssemblyNode(store: ViewerStore, pantinId: string, key: string): Promise<void> {
  const document = store.state.openPantin?.document;
  const holdsSomething =
    document !== undefined &&
    [document.bodies, document.drives, document.actuators, document.sensors].some((items) =>
      items.some((item) => item.assembly === key),
    );
  return holdsSomething
    ? requestAssemblyDeletion(store, pantinId, key)
    : deleteAssembly(store, pantinId, key);
}
