import type { BridgeFailure, BridgeFailureKind, BridgeStatus } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";

// The failure block of the bridge card as plain data: the headline in words, the bridge's
// own message, and what the core names (module, certificate fingerprint).

export interface BridgeFailureView {
  headline: string;
  // The bridge's own message, in English.
  message: string;
  // Warning rather than error: the I/O were edited, nothing is broken.
  warning: boolean;
  // The module and the server certificate the failure concerns, when the core names them.
  details: readonly string[];
  logTitle: string;
  log: readonly string[];
}

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
  untrusted_server_certificate: "bridge.failure.untrusted_server_certificate",
  server_certificate_invalid: "bridge.failure.server_certificate_invalid",
  authentication_failed: "bridge.failure.authentication_failed",
};

// Never drops the certificate: its fingerprint is what the user compares with the PLC's.
function failureDetailsOf(failure: BridgeFailure, t: Translate): string[] {
  return [
    ...(failure.module === null ? [] : [t("bridge.failure.module", { key: failure.module })]),
    ...(failure.certificate === null
      ? []
      : [t("bridge.failure.certificate", { sha256: failure.certificate.sha256 })]),
  ];
}

export function failureViewOf(status: BridgeStatus, t: Translate): BridgeFailureView | null {
  const { failure } = status;
  if (status.state !== "failed" || failure === null) {
    return null;
  }
  return {
    headline: t(FAILURE_KEYS[failure.kind]),
    message: failure.message,
    warning: failure.kind === "mapping_changed",
    details: failureDetailsOf(failure, t),
    logTitle: t("bridge.log.title"),
    log: status.log,
  };
}
