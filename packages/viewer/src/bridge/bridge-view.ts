import type { BridgeFailureKind, BridgeState, BridgeStatus } from "@pantin/protocol";
import { createTranslator, type MessageKey, type Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { type BridgeModel, type BridgeNetworkMode, lanListenOf } from "./bridge-model.ts";

// The bridge bar as plain data (ADR 0050 point 8): status in, texts out. No
// network rule is computed here; the core validates and the viewer shows.

type BridgeButtonKind = "start" | "stop" | "restart";
type BridgeChipTone = "idle" | "busy" | "ok" | "error";

interface BridgeFailureView {
  headline: string;
  // The bridge's own message, in English.
  message: string;
  // Warning rather than error: the I/O were edited, nothing is broken.
  warning: boolean;
  logTitle: string;
  log: readonly string[];
}

export interface BridgeView {
  label: string;
  state: BridgeState;
  chipText: string;
  chipTone: BridgeChipTone;
  mode: BridgeNetworkMode;
  localLabel: string;
  lanLabel: string;
  listenLabel: string;
  listenChoices: readonly string[];
  listen: string;
  allowLabel: string;
  allowText: string;
  // Choice, address and allow list are locked while the bridge runs, and while
  // nothing can be started.
  networkLocked: boolean;
  showLanFields: boolean;
  networkError: string | null;
  button: { kind: BridgeButtonKind; label: string; enabled: boolean };
  // Why the button or the controls are disabled, or null.
  notice: string | null;
  moduleLines: readonly string[];
  runningHint: string | null;
  failure: BridgeFailureView | null;
}

const STATE_KEYS: Record<BridgeState, MessageKey> = {
  stopped: "bridge.state.stopped",
  starting: "bridge.state.starting",
  running: "bridge.state.running",
  stopping: "bridge.state.stopping",
  failed: "bridge.state.failed",
};

const CHIP_TONES: Record<BridgeState, BridgeChipTone> = {
  stopped: "idle",
  starting: "busy",
  running: "ok",
  stopping: "busy",
  failed: "error",
};

const FAILURE_KEYS: Record<BridgeFailureKind, MessageKey> = {
  configuration: "bridge.failure.configuration",
  core_unavailable: "bridge.failure.core_unavailable",
  mapping_not_valid: "bridge.failure.mapping_not_valid",
  mapping_changed: "bridge.failure.mapping_changed",
  bus_closed: "bridge.failure.bus_closed",
  protocol: "bridge.failure.protocol",
  unexpected: "bridge.failure.unexpected",
  spawn_failed: "bridge.failure.spawn_failed",
  start_timeout: "bridge.failure.start_timeout",
  crashed: "bridge.failure.crashed",
};

const BUTTON_KEYS: Record<BridgeButtonKind, MessageKey> = {
  start: "bridge.action.start",
  stop: "bridge.action.stop",
  restart: "bridge.action.restart",
};

function buttonKindOf(state: BridgeState): BridgeButtonKind {
  if (state === "failed") {
    return "restart";
  }
  return state === "stopped" ? "start" : "stop";
}

function failureViewOf(status: BridgeStatus, t: Translate): BridgeFailureView | null {
  const { failure } = status;
  if (status.state !== "failed" || failure === null) {
    return null;
  }
  return {
    headline: t(FAILURE_KEYS[failure.kind]),
    message: failure.message,
    warning: failure.kind === "mapping_changed",
    logTitle: t("bridge.log.title"),
    log: status.log,
  };
}

function moduleLinesOf(status: BridgeStatus, t: Translate): string[] {
  if (status.state !== "running") {
    return [];
  }
  return status.modules.map((module) =>
    t(module.plcConnected ? "bridge.module.connected" : "bridge.module.waiting", {
      key: module.key,
      listen: status.network?.listen ?? "",
      port: module.port,
    }),
  );
}

// Why the button is disabled; a stop is never blocked by either reason.
function noticeOf(status: BridgeStatus, kind: BridgeButtonKind, t: Translate): string | null {
  if (status.availability === "unavailable") {
    return t("bridge.unavailable");
  }
  return status.externalBridgeConnected && kind !== "stop" ? t("bridge.external") : null;
}

export function buildBridgeView(model: BridgeModel, t: Translate): BridgeView | null {
  const { status, draft } = model;
  if (status === null) {
    return null;
  }
  const unavailable = status.availability === "unavailable";
  const kind = buttonKindOf(status.state);
  const canStart = !unavailable && !status.externalBridgeConnected;
  const settled = status.state === "stopped" || status.state === "failed";
  const enabled = !model.pending && (kind === "stop" ? status.state !== "stopping" : canStart);
  return {
    label: t("bridge.label"),
    state: status.state,
    chipText: t(STATE_KEYS[status.state]),
    chipTone: CHIP_TONES[status.state],
    mode: draft.mode,
    localLabel: t("bridge.network.local"),
    lanLabel: t("bridge.network.lan"),
    listenLabel: t("bridge.network.listen"),
    listenChoices: status.listenChoices,
    listen: lanListenOf(model),
    allowLabel: t("bridge.network.allow"),
    allowText: draft.allowText,
    networkLocked: unavailable || !settled,
    showLanFields: draft.mode === "lan",
    networkError: model.networkError,
    button: { kind, label: t(BUTTON_KEYS[kind]), enabled },
    notice: noticeOf(status, kind, t),
    moduleLines: moduleLinesOf(status, t),
    runningHint: status.state === "running" ? t("bridge.running.hint") : null,
    failure: failureViewOf(status, t),
  };
}

/**
 * What decides a redraw of the bar. The typed allow text lives in its input, so
 * committing it must not redraw: a redraw between mousedown and mouseup would
 * replace the button being clicked.
 */
export function bridgeRedrawKey(view: BridgeView): string {
  return JSON.stringify({ ...view, allowText: "" });
}

/** The bar of the open Pantin; none while no Pantin is open. */
export function bridgeViewOf(model: BridgeModel, state: ViewerState): BridgeView | null {
  return state.openPantin === null
    ? null
    : buildBridgeView(model, createTranslator(state.language));
}
