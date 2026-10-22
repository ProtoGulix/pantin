import type { BridgeState, IoMappingResponse, OpcuaBridgeStatus } from "@pantin/protocol";
import { OPCUA_CLIENT_KIND } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { createTranslator } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { type BridgeFailureView, failureViewOf } from "./bridge-failure-view.ts";
import {
  type BridgeButtonKind,
  BUTTON_KEYS,
  buttonKindOf,
  REASON_KEYS,
  STATE_KEYS,
  STATE_TONES,
} from "./bridge-state-texts.ts";
import {
  MODULE_CONNECTION_KEYS,
  type ModuleConnection,
  moduleConnection,
  type StatusTone,
} from "./module-connection.ts";
import {
  clientCertificateViewOf,
  failureExplanationOf,
  type OpcuaCertificateView,
  type OpcuaTrustPromptView,
  rejectionNoticeOf,
  trustPromptOf,
} from "./opcua-certificate-view.ts";
import type { OpcuaBridgeModel } from "./opcua-model.ts";

// The OPC UA card of the side panel as plain data (ADR 0065 point 13): status in, texts out. No
// network rule is computed here; the core validates and the viewer shows.

// A module of the I/O mapping: the lines of the card exist before the bridge runs.
export interface OpcuaMappingModule {
  key: string;
  port: number;
  // The user name of a `user` login; null for the anonymous one.
  userName: string | null;
}

export interface OpcuaModuleLine {
  key: string;
  // `opc.tcp://<target>:<port><path>` once the bridge reports it, else the port alone.
  endpoint: string;
  targetLabel: string;
  target: string;
  targetLocked: boolean;
  // The login in words: "anonymous" or "user and password (name)".
  loginText: string;
  // Present for a `user` login only. The password itself is never part of the view.
  passwordLabel: string | null;
  passwordHint: string | null;
  connection: ModuleConnection;
  statusText: string;
  reasonText: string | null;
}

export interface OpcuaBridgeView {
  label: string;
  state: BridgeState;
  stateText: string;
  stateTone: StatusTone;
  button: { kind: BridgeButtonKind; label: string; enabled: boolean };
  notice: string | null;
  networkError: string | null;
  moduleLines: readonly OpcuaModuleLine[];
  certificate: OpcuaCertificateView | null;
  // Said while no bridge has shown Pantin's thumbprints yet.
  certificateHint: string | null;
  rejectionNotice: string | null;
  trustPrompt: OpcuaTrustPromptView | null;
  failureExplanation: string | null;
  failure: BridgeFailureView | null;
  runningHint: string | null;
}

export function opcuaModulesOf(
  modules: IoMappingResponse["modules"] | null,
): OpcuaMappingModule[] | null {
  return (
    modules?.flatMap((module) =>
      module.transport.kind === OPCUA_CLIENT_KIND
        ? [
            {
              key: module.key,
              port: module.transport.port,
              userName:
                module.transport.auth.kind === "user" ? module.transport.auth.userName : null,
            },
          ]
        : [],
    ) ?? null
  );
}

function lineOf(
  module: OpcuaMappingModule,
  context: { status: OpcuaBridgeStatus; model: OpcuaBridgeModel; settled: boolean; t: Translate },
): OpcuaModuleLine {
  const { status, model, settled, t } = context;
  const reported = status.modules.find((found) => found.key === module.key);
  const connection = moduleConnection([status], module.key);
  const user = module.userName !== null;
  return {
    key: module.key,
    endpoint:
      reported === undefined ? t("bridge.opcua.port", { port: module.port }) : reported.endpoint,
    targetLabel: t("bridge.opcua.target", { key: module.key }),
    target: model.targets[module.key] ?? "",
    targetLocked: !settled,
    loginText: user
      ? t("bridge.opcua.login.user", { name: module.userName ?? "" })
      : t("bridge.opcua.login.anonymous"),
    passwordLabel: user ? t("bridge.opcua.password", { key: module.key }) : null,
    passwordHint: user ? t("bridge.opcua.passwordHint") : null,
    connection,
    statusText: t(MODULE_CONNECTION_KEYS[connection]),
    reasonText:
      connection === "waiting" && reported?.reason != null ? t(REASON_KEYS[reported.reason]) : null,
  };
}

function noticeOf(status: OpcuaBridgeStatus, kind: BridgeButtonKind, t: Translate): string | null {
  if (status.availability === "unavailable") {
    return t("bridge.opcua.unavailable");
  }
  return status.externalBridgeConnected && kind !== "stop" ? t("bridge.external") : null;
}

/** The card is shown for a Pantin that has OPC UA modules, or while the bridge is not stopped. */
export function buildOpcuaView(
  model: OpcuaBridgeModel,
  modules: readonly OpcuaMappingModule[] | null,
  t: Translate,
): OpcuaBridgeView | null {
  const { status } = model;
  if (status === null || (status.state === "stopped" && (modules ?? []).length === 0)) {
    return null;
  }
  const kind = buttonKindOf(status.state);
  const settled = status.state === "stopped" || status.state === "failed";
  const unavailable = status.availability === "unavailable";
  const lines = (modules ?? []).map((module) => lineOf(module, { status, model, settled, t }));
  const canStart = !unavailable && !status.externalBridgeConnected;
  const enabled = !model.pending && (kind === "stop" ? status.state !== "stopping" : canStart);
  return {
    label: t("bridge.opcua.label"),
    state: status.state,
    stateText: t(STATE_KEYS[status.state]),
    stateTone: STATE_TONES[status.state],
    button: { kind, label: t(BUTTON_KEYS[kind]), enabled },
    notice: noticeOf(status, kind, t),
    networkError: model.error,
    moduleLines: lines,
    certificate:
      status.clientCertificate === null
        ? null
        : clientCertificateViewOf(status.clientCertificate, t),
    certificateHint: status.clientCertificate === null ? t("bridge.opcua.certificate.later") : null,
    rejectionNotice: rejectionNoticeOf(status, t),
    trustPrompt: trustPromptOf(
      status,
      !model.pending && !unavailable && !status.externalBridgeConnected,
      t,
    ),
    failureExplanation: failureExplanationOf(status, t),
    failure: failureViewOf(status, t),
    runningHint: status.state === "running" ? t("bridge.running.hint") : null,
  };
}

/**
 * What decides a redraw of the card. The typed targets live in their inputs, so committing one
 * must not redraw: a redraw between mousedown and mouseup would replace the button being clicked.
 */
export function opcuaRedrawKey(view: OpcuaBridgeView): string {
  return JSON.stringify({
    ...view,
    moduleLines: view.moduleLines.map((line) => ({ ...line, target: "" })),
  });
}

/** The card of the open Pantin; none while no Pantin is open. */
export function opcuaViewOf(model: OpcuaBridgeModel, state: ViewerState): OpcuaBridgeView | null {
  return state.openPantin === null
    ? null
    : buildOpcuaView(
        model,
        opcuaModulesOf(state.io.mapping?.modules ?? null),
        createTranslator(state.language),
      );
}
