import type { BridgeState, PlcModuleLossReason } from "@pantin/protocol";
import type { MessageKey } from "../i18n/translate.ts";
import type { StatusTone } from "./module-connection.ts";

// The words and tones every bridge card shares (ADR 0050 point 8, ADR 0065 point 13).

export type BridgeButtonKind = "start" | "stop" | "restart";

export const STATE_KEYS: Record<BridgeState, MessageKey> = {
  stopped: "bridge.state.stopped",
  starting: "bridge.state.starting",
  running: "bridge.state.running",
  stopping: "bridge.state.stopping",
  failed: "bridge.state.failed",
};

export const STATE_TONES: Record<BridgeState, StatusTone> = {
  stopped: "idle",
  starting: "busy",
  running: "ok",
  stopping: "busy",
  failed: "error",
};

export const REASON_KEYS: Record<PlcModuleLossReason, MessageKey> = {
  closed: "bridge.module.reason.closed",
  timeout: "bridge.module.reason.timeout",
  node_mismatch: "bridge.module.reason.node_mismatch",
  certificate_rejected: "bridge.module.reason.certificate_rejected",
};

export const BUTTON_KEYS: Record<BridgeButtonKind, MessageKey> = {
  start: "bridge.action.start",
  stop: "bridge.action.stop",
  restart: "bridge.action.restart",
};

export function buttonKindOf(state: BridgeState): BridgeButtonKind {
  if (state === "failed") {
    return "restart";
  }
  return state === "stopped" ? "start" : "stop";
}
