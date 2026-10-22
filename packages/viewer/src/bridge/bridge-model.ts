import type {
  BridgeListResponse,
  BridgeStatus,
  ModbusBridgeNetwork,
  ModbusBridgeStatus,
  SetModbusBridgeRequest,
} from "@pantin/protocol";
import { MODBUS_TCP_SLAVE_KIND } from "@pantin/protocol";
import { modbusStatusOf } from "./modbus-status.ts";
import {
  INITIAL_OPCUA_MODEL,
  isOpcuaActive,
  type OpcuaBridgeModel,
  opcuaAfterStreamList,
} from "./opcua-model.ts";

// What the bridge block knows (ADR 0050 point 8): the status the core pushed and
// what the user typed. The viewer decides nothing about the network: the core
// validates listen and allow, and its refusal is shown as it comes.

export type BridgeNetworkMode = "local" | "lan";

// The first of `listenChoices`, fixed by the ADR; the "local" choice sends it.
export const LOCAL_LISTEN = "127.0.0.1";

export interface BridgeDraft {
  mode: BridgeNetworkMode;
  // The chosen address of the private network; "" until the user or a status sets it.
  listen: string;
  // As typed, comma or space separated.
  allowText: string;
}

export interface BridgeModel {
  // Every transport's status as the core last sent them (ADR 0065 point 7); empty until the
  // first `bridge` event.
  readonly statuses: readonly BridgeStatus[];
  // The Modbus entry of `statuses`. Null until the first `bridge` event; the unavailable
  // status when the core's list has no Modbus entry.
  readonly status: ModbusBridgeStatus | null;
  // The OPC UA card's own status, targets and request state.
  readonly opcua: OpcuaBridgeModel;
  readonly draft: BridgeDraft;
  // The core's 400 message about the address or the allow list.
  readonly networkError: string | null;
  // A start or stop request is in flight.
  readonly pending: boolean;
  // The stream sent a status while the request was in flight: it is newer than
  // the request's answer, which then must not replace it.
  readonly streamedWhilePending: boolean;
}

export const INITIAL_BRIDGE_MODEL: BridgeModel = {
  statuses: [],
  status: null,
  opcua: INITIAL_OPCUA_MODEL,
  draft: { mode: "local", listen: "", allowText: "" },
  networkError: null,
  pending: false,
  streamedWhilePending: false,
};

// What the card shows when the core's list has no Modbus bridge: a bridge that cannot start.
const MISSING_MODBUS_STATUS: ModbusBridgeStatus = {
  transport: MODBUS_TCP_SLAVE_KIND,
  availability: "unavailable",
  state: "stopped",
  network: null,
  listenChoices: [],
  modules: [],
  failure: null,
  log: [],
  externalBridgeConnected: false,
};

function isLoopback(address: string): boolean {
  return address === LOCAL_LISTEN || address.startsWith("127.");
}

function draftOfNetwork(network: ModbusBridgeNetwork): BridgeDraft {
  return isLoopback(network.listen)
    ? { mode: "local", listen: "", allowText: "" }
    : { mode: "lan", listen: network.listen, allowText: network.allow.join(", ") };
}

/**
 * A status of the stream. When the state changes while the core holds a
 * network (starting, running, failed), the fields show it: this is how Restart
 * reuses the last network. Within one state the user's typing is left alone.
 */
export function bridgeAfterStatus(model: BridgeModel, status: ModbusBridgeStatus): BridgeModel {
  const statuses = model.statuses.some((known) => known.transport === status.transport)
    ? model.statuses.map((known) => (known.transport === status.transport ? status : known))
    : [...model.statuses, status];
  return shownModbusAfter({ ...model, statuses }, status);
}

function shownModbusAfter(model: BridgeModel, status: ModbusBridgeStatus): BridgeModel {
  const changedState = model.status?.state !== status.state;
  const draft =
    changedState && status.state !== "stopped" && status.network !== null
      ? draftOfNetwork(status.network)
      : model.draft;
  return { ...model, status, draft, networkError: changedState ? null : model.networkError };
}

export function bridgeWithDraft(model: BridgeModel, draft: BridgeDraft): BridgeModel {
  // The core's refusal stays until the next request or state change: clearing it
  // here would redraw the block when a field commits on mousedown, and lose the click.
  return { ...model, draft };
}

export function bridgeWithPending(model: BridgeModel, pending: boolean): BridgeModel {
  return { ...model, pending, streamedWhilePending: false };
}

/** The list of the stream: always the latest, and it outdates a request's answer. */
export function bridgeAfterStreamList(model: BridgeModel, list: BridgeListResponse): BridgeModel {
  const next = shownModbusAfter(
    { ...model, statuses: list.bridges },
    modbusStatusOf(list) ?? MISSING_MODBUS_STATUS,
  );
  return {
    ...next,
    opcua: opcuaAfterStreamList(model.opcua, list),
    streamedWhilePending: model.pending,
  };
}

/**
 * The answer of a start or stop request. The core writes the request's
 * transition on the stream before answering, and every later change after, so
 * a stream status received meanwhile is at least as new as the answer: a stop
 * answered "stopping" after the stream said "stopped" would stick otherwise.
 */
export function bridgeAfterAnswer(model: BridgeModel, status: ModbusBridgeStatus): BridgeModel {
  return model.streamedWhilePending ? model : bridgeAfterStatus(model, status);
}

export function bridgeWithNetworkError(
  model: BridgeModel,
  networkError: string | null,
): BridgeModel {
  return { ...model, networkError };
}

/** The address a private-network start listens on: the typed one, else the first non-loopback choice. */
export function lanListenOf(model: BridgeModel): string {
  const choices = model.status?.listenChoices ?? [];
  if (choices.includes(model.draft.listen)) {
    return model.draft.listen;
  }
  return choices.find((choice) => !isLoopback(choice)) ?? "";
}

// Only splits the text: whether an entry is an IP or a CIDR is the core's call.
function allowEntriesOf(text: string): string[] {
  return text.split(/[\s,;]+/).filter((entry) => entry !== "");
}

/** The exact PUT body of "Start" and "Restart". */
export function bridgeStartRequest(model: BridgeModel): SetModbusBridgeRequest {
  return model.draft.mode === "local"
    ? { running: true, listen: LOCAL_LISTEN, allow: [] }
    : { running: true, listen: lanListenOf(model), allow: allowEntriesOf(model.draft.allowText) };
}

export const BRIDGE_STOP_REQUEST: SetModbusBridgeRequest = { running: false };

/** A bridge of any kind goes on after the Pantin is closed unless it is stopped (ADR 0050 point 7). */
export function isBridgeActive(model: BridgeModel): boolean {
  return isModbusActive(model) || isOpcuaActive(model.opcua);
}

export function isModbusActive(model: BridgeModel): boolean {
  const state = model.status?.state;
  return state === "starting" || state === "running";
}
