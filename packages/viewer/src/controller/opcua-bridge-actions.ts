import type { OpcuaBridgeStatus, SetOpcuaBridgeRequest } from "@pantin/protocol";
import { PantinApiError } from "../api-transport.ts";
import {
  OPCUA_STOP_REQUEST,
  opcuaAfterAnswer,
  opcuaStartRequest,
  opcuaWithError,
  opcuaWithPending,
  opcuaWithTarget,
} from "../bridge/opcua-model.ts";
import { opcuaModulesOf } from "../bridge/opcua-view.ts";
import { createTranslator } from "../i18n/translate.ts";
import { describeFailure } from "../messages.ts";
import { setBridgeModel } from "./bridge-model-store.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The OPC UA bridge of the open Pantin (ADR 0065 points 7 to 10). Like the Modbus one, none of
// these uses store.run: the status arrives on the stream and is written in place. The passwords
// come from the card's fields for one call and are sent in the start request only: never kept in
// a model or the state, never stored by the browser, never logged.

function setOpcua(
  store: ViewerStore,
  change: (current: typeof store.bridgeModel.opcua) => typeof store.bridgeModel.opcua,
): void {
  setBridgeModel(store, { ...store.bridgeModel, opcua: change(store.bridgeModel.opcua) });
}

// 400 is the core refusing a target, a password or the login: its message belongs under the
// fields. Any other failure (409, 403, 503, network) is a message.
function showFailure(store: ViewerStore, error: unknown): void {
  if (error instanceof PantinApiError && error.status === 400) {
    setOpcua(store, (opcua) => opcuaWithError(opcua, error.message));
  } else {
    store.update({ ...store.state, message: describeFailure(error) });
  }
}

/**
 * Sends the request and shows the answer; true when the core accepted it. A second request while
 * one is in flight is refused, and an answer for a Pantin closed meanwhile touches nothing.
 */
async function sendOpcuaRequest(
  store: ViewerStore,
  request: SetOpcuaBridgeRequest,
): Promise<boolean> {
  const open = store.state.openPantin;
  if (open === null || store.bridgeModel.opcua.pending) {
    return false;
  }
  const stillOpen = (): boolean => store.state.openPantin?.id === open.id;
  setOpcua(store, (opcua) => opcuaWithPending(opcuaWithError(opcua, null), true));
  try {
    const status: OpcuaBridgeStatus = await store.ports.api.setOpcuaBridge(open.id, request);
    if (stillOpen()) {
      setOpcua(store, (opcua) => opcuaAfterAnswer(opcua, status));
    }
    return true;
  } catch (error) {
    if (stillOpen()) {
      showFailure(store, error);
    }
    return false;
  } finally {
    if (stillOpen()) {
      setOpcua(store, (opcua) => opcuaWithPending(opcua, false));
    }
  }
}

/** Start, Restart, or "Trust and restart" with the one certificate the user looked at. */
async function startOpcua(
  store: ViewerStore,
  passwords: Readonly<Record<string, string>>,
  trust: readonly string[],
): Promise<void> {
  const modules = opcuaModulesOf(store.state.io.mapping?.modules ?? null) ?? [];
  const { opcua } = store.bridgeModel;
  if (modules.some((module) => (opcua.targets[module.key] ?? "").trim() === "")) {
    const message = createTranslator(store.state.language)("bridge.opcua.targetMissing");
    setOpcua(store, (current) => opcuaWithError(current, message));
    return;
  }
  const moduleKeys = modules.map((module) => module.key);
  await sendOpcuaRequest(store, opcuaStartRequest(opcua, { moduleKeys, passwords, trust }));
}

/** True when the core accepted the stop (also when the bridge was already stopped). */
export function stopOpcuaBridge(store: ViewerStore): Promise<boolean> {
  return sendOpcuaRequest(store, OPCUA_STOP_REQUEST);
}

export function opcuaBridgeIntents(store: ViewerStore) {
  return {
    startOpcuaBridge: (passwords: Readonly<Record<string, string>>) =>
      void startOpcua(store, passwords, []),
    trustAndRestartOpcuaBridge: (sha256: string, passwords: Readonly<Record<string, string>>) =>
      void startOpcua(store, passwords, [sha256]),
    stopOpcuaBridge: () => void stopOpcuaBridge(store),
    editOpcuaTarget: (moduleKey: string, text: string) =>
      setOpcua(store, (opcua) => opcuaWithTarget(opcua, moduleKey, text)),
  };
}
