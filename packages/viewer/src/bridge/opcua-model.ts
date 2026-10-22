import {
  type BridgeListResponse,
  OPCUA_CLIENT_KIND,
  type OpcuaBridgeStatus,
  type SetOpcuaBridgeRequest,
} from "@pantin/protocol";

// What the OPC UA card knows (ADR 0065 points 8 to 10, 13): the status the core pushed and what
// the user typed. Only the targets are kept here. A password lives in its input until the request
// leaves, and is never part of any model, state or storage (point 9). The core validates the
// addresses and its refusal is shown as it comes.

export interface OpcuaBridgeModel {
  // Null until the first `bridge` event.
  readonly status: OpcuaBridgeStatus | null;
  // The PLC address of each module as typed, by module key. Never saved: the core asks for it at
  // each start (point 8).
  readonly targets: Readonly<Record<string, string>>;
  // The core's 400 or 403 message about a target, a password or the login.
  readonly error: string | null;
  readonly pending: boolean;
  // The stream sent a status while the request was in flight: it is newer than the answer.
  readonly streamedWhilePending: boolean;
}

export const INITIAL_OPCUA_MODEL: OpcuaBridgeModel = {
  status: null,
  targets: {},
  error: null,
  pending: false,
  streamedWhilePending: false,
};

// What the card shows when the core's list has no OPC UA bridge: a bridge that cannot start.
const MISSING_OPCUA_STATUS: OpcuaBridgeStatus = {
  transport: OPCUA_CLIENT_KIND,
  availability: "unavailable",
  state: "stopped",
  network: null,
  clientCertificate: null,
  modules: [],
  failure: null,
  log: [],
  externalBridgeConnected: false,
};

function opcuaStatusOf(list: BridgeListResponse): OpcuaBridgeStatus | undefined {
  return list.bridges.find(
    (status): status is OpcuaBridgeStatus => status.transport === OPCUA_CLIENT_KIND,
  );
}

/**
 * A status of the stream. When the state changes while the core holds targets (starting, running,
 * failed), the fields show them: this is how Restart and "Trust and restart" reuse the last
 * start. Within one state the user's typing is left alone.
 */
function shownAfter(model: OpcuaBridgeModel, status: OpcuaBridgeStatus): OpcuaBridgeModel {
  const changedState = model.status?.state !== status.state;
  const targets =
    changedState && status.state !== "stopped" && status.network !== null
      ? status.network.targets
      : model.targets;
  return { ...model, status, targets, error: changedState ? null : model.error };
}

export function opcuaAfterStreamList(
  model: OpcuaBridgeModel,
  list: BridgeListResponse,
): OpcuaBridgeModel {
  const next = shownAfter(model, opcuaStatusOf(list) ?? MISSING_OPCUA_STATUS);
  return { ...next, streamedWhilePending: model.pending };
}

/** The answer of a start or stop: a stream status received meanwhile is at least as new. */
export function opcuaAfterAnswer(
  model: OpcuaBridgeModel,
  status: OpcuaBridgeStatus,
): OpcuaBridgeModel {
  return model.streamedWhilePending ? model : shownAfter(model, status);
}

export function opcuaWithTarget(
  model: OpcuaBridgeModel,
  moduleKey: string,
  target: string,
): OpcuaBridgeModel {
  // The core's refusal stays until the next request or state change: clearing it here would
  // redraw the card when a field commits on mousedown, and lose the click.
  return { ...model, targets: { ...model.targets, [moduleKey]: target } };
}

export function opcuaWithPending(model: OpcuaBridgeModel, pending: boolean): OpcuaBridgeModel {
  return { ...model, pending, streamedWhilePending: false };
}

export function opcuaWithError(model: OpcuaBridgeModel, error: string | null): OpcuaBridgeModel {
  return { ...model, error };
}

export interface OpcuaStartInput {
  // The OPC UA modules of the mapping: the request names exactly these (point 9).
  moduleKeys: readonly string[];
  // Typed passwords by module key; an empty one is left out, which keeps the stored one.
  passwords: Readonly<Record<string, string>>;
  // SHA-256 of the server certificates the user chose to trust.
  trust: readonly string[];
}

/** The exact PUT body of "Start", "Restart" and "Trust and restart". */
export function opcuaStartRequest(
  model: OpcuaBridgeModel,
  input: OpcuaStartInput,
): SetOpcuaBridgeRequest {
  const targets = Object.fromEntries(
    input.moduleKeys.map((key) => [key, (model.targets[key] ?? "").trim()]),
  );
  const passwords = Object.fromEntries(
    Object.entries(input.passwords).filter(([, password]) => password !== ""),
  );
  return {
    running: true,
    targets,
    ...(Object.keys(passwords).length === 0 ? {} : { passwords }),
    ...(input.trust.length === 0 ? {} : { trust: [...input.trust] }),
  };
}

export const OPCUA_STOP_REQUEST: SetOpcuaBridgeRequest = { running: false };

export function isOpcuaActive(model: OpcuaBridgeModel): boolean {
  return model.status?.state === "starting" || model.status?.state === "running";
}
