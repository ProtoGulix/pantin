import type {
  BridgeState,
  IoMappingResponse,
  ModbusBridgeStatus,
  PlcModuleLossReason,
} from "@pantin/protocol";
import { MODBUS_TCP_SLAVE_KIND } from "@pantin/protocol";
import { type CentralLayout, showsIo } from "../central-layout.ts";
import { createTranslator, type MessageKey, type Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { type BridgeFailureView, failureViewOf } from "./bridge-failure-view.ts";
import {
  type BridgeModel,
  type BridgeNetworkMode,
  LOCAL_LISTEN,
  lanListenOf,
} from "./bridge-model.ts";
import {
  MODULE_CONNECTION_KEYS,
  type ModuleConnection,
  moduleConnection,
  type StatusTone,
} from "./module-connection.ts";

// The bridge block of the side panel as plain data (ADR 0050 point 8): status in, texts out. No
// network rule is computed here; the core validates and the viewer shows.

type BridgeButtonKind = "start" | "stop" | "restart";

// A module of the I/O mapping: the lines of the card exist before the bridge runs.
export interface BridgeMappingModule {
  key: string;
  port: number;
}

export interface BridgeModuleLine {
  key: string;
  // "address:port" the PLC connects to.
  address: string;
  connection: ModuleConnection;
  // Visible next to the dot, which is decoration.
  statusText: string;
  // Why the PLC is not connected, in words; null when connected or never reported.
  reasonText: string | null;
}

export interface BridgeView {
  label: string;
  state: BridgeState;
  // The state as text and as the colour of its dot.
  stateText: string;
  stateTone: StatusTone;
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
  moduleLines: readonly BridgeModuleLine[];
  // Shown instead of the lines when the I/O list has no module.
  noModuleText: string | null;
  // Switches the central layout to the I/O view, where the mapping is edited.
  configureIo: { text: string; label: string; active: boolean };
  // Opens the log window; shown whatever the bridge state (ADR 0054 point 5).
  journalButton: { text: string; label: string };
  // The chip that unfolds the network part: it tells the mode even when folded.
  networkTitle: string;
  // A refusal from the core must not stay hidden in a closed part.
  networkForcedOpen: boolean;
  runningHint: string | null;
  // The PLC's writes are ignored on forced tags: said while the bridge runs.
  forcedWarning: { text: string; releaseLabel: string; releaseHint: string } | null;
  failure: BridgeFailureView | null;
}

const STATE_KEYS: Record<BridgeState, MessageKey> = {
  stopped: "bridge.state.stopped",
  starting: "bridge.state.starting",
  running: "bridge.state.running",
  stopping: "bridge.state.stopping",
  failed: "bridge.state.failed",
};

const STATE_TONES: Record<BridgeState, StatusTone> = {
  stopped: "idle",
  starting: "busy",
  running: "ok",
  stopping: "busy",
  failed: "error",
};

const REASON_KEYS: Record<PlcModuleLossReason, MessageKey> = {
  closed: "bridge.module.reason.closed",
  timeout: "bridge.module.reason.timeout",
  node_mismatch: "bridge.module.reason.node_mismatch",
  certificate_rejected: "bridge.module.reason.certificate_rejected",
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

function lineOf(
  module: { key: string; reason?: PlcModuleLossReason | null },
  address: string,
  status: ModbusBridgeStatus,
  t: Translate,
): BridgeModuleLine {
  const connection = moduleConnection(status, module.key);
  return {
    key: module.key,
    address,
    connection,
    statusText: t(MODULE_CONNECTION_KEYS[connection]),
    reasonText:
      connection === "waiting" && module.reason != null ? t(REASON_KEYS[module.reason]) : null,
  };
}

// Running: what the core reports. Otherwise: the mapping, at the address a start would listen on.
function moduleLinesOf(
  model: BridgeModel,
  status: ModbusBridgeStatus,
  mappingModules: readonly BridgeMappingModule[],
  t: Translate,
): BridgeModuleLine[] {
  if (status.state === "running") {
    return status.modules.map((module) => lineOf(module, module.endpoint, status, t));
  }
  const listen = model.draft.mode === "local" ? LOCAL_LISTEN : lanListenOf(model);
  return mappingModules.map((module) => lineOf(module, `${listen}:${module.port}`, status, t));
}

// Why the button is disabled; a stop is never blocked by either reason.
function noticeOf(status: ModbusBridgeStatus, kind: BridgeButtonKind, t: Translate): string | null {
  if (status.availability === "unavailable") {
    return t("bridge.unavailable");
  }
  return status.externalBridgeConnected && kind !== "stop" ? t("bridge.external") : null;
}

function forcedWarningOf(forcedCount: number, t: Translate): BridgeView["forcedWarning"] {
  return {
    text: t("bridge.forced", { count: forcedCount }),
    releaseLabel: t("forced.releaseAll", { count: forcedCount }),
    releaseHint: t("forced.releaseAllHint"),
  };
}

function configureIoOf(t: Translate, layout: CentralLayout): BridgeView["configureIo"] {
  return {
    text: t("bridge.configureIoShort"),
    label: t("bridge.configureIo"),
    active: showsIo(layout),
  };
}

export function buildBridgeView(
  model: BridgeModel,
  t: Translate,
  layout: CentralLayout,
  // Null while the mapping is not loaded (or could not be read): no module is claimed then.
  mappingModules: readonly BridgeMappingModule[] | null = [],
  forcedCount = 0,
): BridgeView | null {
  const { status, draft } = model;
  if (status === null) {
    return null;
  }
  const unavailable = status.availability === "unavailable";
  const kind = buttonKindOf(status.state);
  const canStart = !unavailable && !status.externalBridgeConnected;
  const moduleLines = moduleLinesOf(model, status, mappingModules ?? [], t);
  const settled = status.state === "stopped" || status.state === "failed";
  const enabled = !model.pending && (kind === "stop" ? status.state !== "stopping" : canStart);
  return {
    label: t("bridge.label"),
    state: status.state,
    stateText: t(STATE_KEYS[status.state]),
    stateTone: STATE_TONES[status.state],
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
    moduleLines,
    noModuleText:
      moduleLines.length === 0 && mappingModules !== null ? t("bridge.modules.none") : null,
    configureIo: configureIoOf(t, layout),
    journalButton: { text: t("bridge.journal.button"), label: t("bridge.journal.buttonHint") },
    networkTitle: t(draft.mode === "lan" ? "bridge.network.titleLan" : "bridge.network.titleLocal"),
    networkForcedOpen: model.networkError !== null,
    runningHint: status.state === "running" ? t("bridge.running.hint") : null,
    forcedWarning:
      status.state === "running" && forcedCount > 0 ? forcedWarningOf(forcedCount, t) : null,
    failure: failureViewOf(status, t),
  };
}

/**
 * What decides a redraw of the block. The typed allow text lives in its input, so
 * committing it must not redraw: a redraw between mousedown and mouseup would
 * replace the button being clicked.
 */
export function bridgeRedrawKey(view: BridgeView): string {
  return JSON.stringify({ ...view, allowText: "" });
}

// This card is the Modbus bridge's (ADR 0064 point 8): the other transports' modules are not its lines.
function modbusModulesOf(
  modules: IoMappingResponse["modules"] | null,
): BridgeMappingModule[] | null {
  return (
    modules?.flatMap((module) =>
      module.transport.kind === MODBUS_TCP_SLAVE_KIND
        ? [{ key: module.key, port: module.transport.port }]
        : [],
    ) ?? null
  );
}

/** The block of the open Pantin; none while no Pantin is open. */
export function bridgeViewOf(
  model: BridgeModel,
  state: ViewerState,
  forcedCount = 0,
): BridgeView | null {
  return state.openPantin === null
    ? null
    : buildBridgeView(
        model,
        createTranslator(state.language),
        state.centralLayout,
        modbusModulesOf(state.io.mapping?.modules ?? null),
        forcedCount,
      );
}
