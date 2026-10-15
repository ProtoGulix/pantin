import type { BridgeNetwork, BridgeStatus, SetBridgeRequest } from "@pantin/protocol";

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
  // Null until the first `bridge` event of the stream.
  readonly status: BridgeStatus | null;
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
  status: null,
  draft: { mode: "local", listen: "", allowText: "" },
  networkError: null,
  pending: false,
  streamedWhilePending: false,
};

function isLoopback(address: string): boolean {
  return address === LOCAL_LISTEN || address.startsWith("127.");
}

function draftOfNetwork(network: BridgeNetwork): BridgeDraft {
  return isLoopback(network.listen)
    ? { mode: "local", listen: "", allowText: "" }
    : { mode: "lan", listen: network.listen, allowText: network.allow.join(", ") };
}

/**
 * A status of the stream. When the state changes while the core holds a
 * network (starting, running, failed), the fields show it: this is how Restart
 * reuses the last network. Within one state the user's typing is left alone.
 */
export function bridgeAfterStatus(model: BridgeModel, status: BridgeStatus): BridgeModel {
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

/** A status of the stream: always the latest, and it outdates a request's answer. */
export function bridgeAfterStreamStatus(model: BridgeModel, status: BridgeStatus): BridgeModel {
  return { ...bridgeAfterStatus(model, status), streamedWhilePending: model.pending };
}

/**
 * The answer of a start or stop request. The core writes the request's
 * transition on the stream before answering, and every later change after, so
 * a stream status received meanwhile is at least as new as the answer: a stop
 * answered "stopping" after the stream said "stopped" would stick otherwise.
 */
export function bridgeAfterAnswer(model: BridgeModel, status: BridgeStatus): BridgeModel {
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
export function bridgeStartRequest(model: BridgeModel): SetBridgeRequest {
  return model.draft.mode === "local"
    ? { running: true, listen: LOCAL_LISTEN, allow: [] }
    : { running: true, listen: lanListenOf(model), allow: allowEntriesOf(model.draft.allowText) };
}

export const BRIDGE_STOP_REQUEST: SetBridgeRequest = { running: false };

/** The bridge goes on after the Pantin is closed unless it is stopped (ADR 0050 point 7). */
export function isBridgeActive(model: BridgeModel): boolean {
  const state = model.status?.state;
  return state === "starting" || state === "running";
}
