import type {
  BridgeListResponse,
  ModbusBridgeStatus,
  SetModbusBridgeRequest,
} from "@pantin/protocol";
import { PantinApiError } from "../api-transport.ts";
import type { BridgeIntents } from "../bridge/bridge-intents.ts";
import {
  BRIDGE_STOP_REQUEST,
  type BridgeDraft,
  type BridgeModel,
  bridgeAfterAnswer,
  bridgeAfterStreamList,
  bridgeStartRequest,
  bridgeWithDraft,
  bridgeWithNetworkError,
  bridgeWithPending,
  lanListenOf,
} from "../bridge/bridge-model.ts";
import { bridgeViewOf } from "../bridge/bridge-view.ts";
import { describeFailure } from "../messages.ts";
import {
  closeJournal,
  openJournal,
  refreshJournalOnStatus,
  toggleJournalLevel,
} from "./journal-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The PLC bridge of the open Pantin (ADR 0050 point 8). The core starts and
// stops the process; these actions only send the wanted state. Like the clock,
// none uses store.run: the status arrives on the stream and is written in place.

/** The bar shows the new model in place; it is the only reader of the draft. */
function setBridgeModel(store: ViewerStore, next: BridgeModel): void {
  store.bridgeModel = next;
  store.ports.showBridge(bridgeViewOf(next, store.state));
  // The I/O view's module list shows each module's connection.
  store.renderPanel();
}

/** A bridge event of the stream. */
export function receiveBridge(store: ViewerStore, list: BridgeListResponse): void {
  setBridgeModel(store, bridgeAfterStreamList(store.bridgeModel, list));
  refreshJournalOnStatus(store);
}

// 400 is the core refusing the address or the allow list: its message belongs
// under the fields. Any other failure (409, 403, 503, network) is a message.
function showFailure(store: ViewerStore, error: unknown): void {
  if (error instanceof PantinApiError && error.status === 400) {
    setBridgeModel(store, bridgeWithNetworkError(store.bridgeModel, error.message));
  } else {
    store.update({ ...store.state, message: describeFailure(error) });
  }
}

/**
 * Sends the request and shows the answer; true when the core accepted it.
 * A second request while one is in flight is refused (a double click), and an
 * answer for a Pantin that was closed meanwhile touches nothing.
 */
async function sendBridgeRequest(
  store: ViewerStore,
  request: SetModbusBridgeRequest,
): Promise<boolean> {
  const open = store.state.openPantin;
  if (open === null || store.bridgeModel.pending) {
    return false;
  }
  const stillOpen = (): boolean => store.state.openPantin?.id === open.id;
  setBridgeModel(store, bridgeWithPending(bridgeWithNetworkError(store.bridgeModel, null), true));
  try {
    const status: ModbusBridgeStatus = await store.ports.api.setBridge(open.id, request);
    if (stillOpen()) {
      setBridgeModel(store, bridgeAfterAnswer(store.bridgeModel, status));
    }
    return true;
  } catch (error) {
    if (stillOpen()) {
      showFailure(store, error);
    }
    return false;
  } finally {
    if (stillOpen()) {
      setBridgeModel(store, bridgeWithPending(store.bridgeModel, false));
    }
  }
}

async function startBridge(store: ViewerStore): Promise<void> {
  await sendBridgeRequest(store, bridgeStartRequest(store.bridgeModel));
}

/** True when the core accepted the stop (also when the bridge was already stopped). */
export function stopBridge(store: ViewerStore): Promise<boolean> {
  return sendBridgeRequest(store, BRIDGE_STOP_REQUEST);
}

function changeDraft(store: ViewerStore, change: (draft: BridgeDraft) => BridgeDraft): void {
  const model = store.bridgeModel;
  setBridgeModel(store, bridgeWithDraft(model, change(model.draft)));
}

export function bridgeIntents(store: ViewerStore): BridgeIntents {
  return {
    startBridge: () => void startBridge(store),
    stopBridge: () => void stopBridge(store),
    chooseBridgeNetwork: (mode) =>
      changeDraft(store, (draft) => ({
        ...draft,
        mode: mode === "lan" ? "lan" : "local",
        listen: lanListenOf(store.bridgeModel),
      })),
    chooseBridgeListen: (address) => changeDraft(store, (draft) => ({ ...draft, listen: address })),
    editBridgeAllow: (text) => changeDraft(store, (draft) => ({ ...draft, allowText: text })),
    openBridgeJournal: () => openJournal(store),
    closeBridgeJournal: () => closeJournal(store),
    toggleBridgeJournalLevel: (level) => toggleJournalLevel(store, level),
  };
}
