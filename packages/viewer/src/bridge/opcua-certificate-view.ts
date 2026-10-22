import type {
  BridgeClientCertificate,
  BridgeFailure,
  BridgeServerCertificate,
  OpcuaBridgeStatus,
} from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";

// The certificates of the OPC UA card as plain data (ADR 0065 point 10): Pantin's own, to trust
// in the PLC, and the PLC's, which the user trusts or not. A thumbprint is always text the user
// can select and compare with the PLC's screen.

export interface ThumbprintView {
  label: string;
  value: string;
}

export interface OpcuaCertificateView {
  title: string;
  subjectLine: string;
  applicationUriLine: string;
  thumbprints: readonly ThumbprintView[];
  explanation: string;
}

export interface OpcuaTrustPromptView {
  headline: string;
  explanation: string;
  subjectLine: string;
  validityLine: string;
  thumbprints: readonly ThumbprintView[];
  buttonLabel: string;
  // What the button restarts with: the one certificate shown above.
  sha256: string;
  enabled: boolean;
}

function thumbprintsOf(
  certificate: { sha256: string; sha1: string },
  t: Translate,
): ThumbprintView[] {
  return [
    { label: t("bridge.opcua.sha256"), value: certificate.sha256 },
    { label: t("bridge.opcua.sha1"), value: certificate.sha1 },
  ];
}

export function clientCertificateViewOf(
  certificate: BridgeClientCertificate,
  t: Translate,
): OpcuaCertificateView {
  return {
    title: t("bridge.opcua.certificate.title"),
    subjectLine: t("bridge.opcua.certificate.subject", { value: certificate.subject }),
    applicationUriLine: t("bridge.opcua.certificate.uri", { value: certificate.applicationUri }),
    thumbprints: thumbprintsOf(certificate, t),
    explanation: t("bridge.opcua.certificate.explanation"),
  };
}

function promptOf(
  certificate: BridgeServerCertificate,
  enabled: boolean,
  t: Translate,
): OpcuaTrustPromptView {
  return {
    headline: t("bridge.opcua.trust.headline"),
    explanation: t("bridge.opcua.trust.explanation"),
    subjectLine: t("bridge.opcua.certificate.subject", { value: certificate.subject }),
    validityLine: t("bridge.opcua.trust.validity", {
      from: certificate.notBefore,
      to: certificate.notAfter,
    }),
    thumbprints: thumbprintsOf(certificate, t),
    buttonLabel: t("bridge.opcua.trust.button"),
    sha256: certificate.sha256,
    enabled,
  };
}

/** Offered on `untrusted_server_certificate` only: `trust` never overrides another failure. */
export function trustPromptOf(
  status: OpcuaBridgeStatus,
  canRestart: boolean,
  t: Translate,
): OpcuaTrustPromptView | null {
  const failure: BridgeFailure | null = status.failure;
  if (
    status.state !== "failed" ||
    failure?.kind !== "untrusted_server_certificate" ||
    failure.certificate === null
  ) {
    return null;
  }
  return promptOf(failure.certificate, canRestart, t);
}

/** The sentence that says what to do about a failure of the PLC's certificate or login. */
export function failureExplanationOf(status: OpcuaBridgeStatus, t: Translate): string | null {
  const { failure } = status;
  if (status.state !== "failed" || failure === null) {
    return null;
  }
  switch (failure.kind) {
    case "server_certificate_invalid":
      return failure.certificate === null
        ? t("bridge.opcua.invalid.explanation")
        : `${t("bridge.opcua.invalid.explanation")} ${t("bridge.opcua.invalid.reason", { reason: failure.certificate.reason })}`;
    case "authentication_failed":
      return t("bridge.opcua.authentication.explanation");
    default:
      return null;
  }
}

/**
 * The PLC refused Pantin's certificate: Pantin retries every 10 s, so trusting it in the PLC is
 * enough. Said with the thumbprints to look for, once a bridge has shown them.
 */
export function rejectionNoticeOf(status: OpcuaBridgeStatus, t: Translate): string | null {
  if (!status.modules.some((module) => module.reason === "certificate_rejected")) {
    return null;
  }
  const { clientCertificate } = status;
  return clientCertificate === null
    ? t("bridge.opcua.rejected.noThumbprints")
    : t("bridge.opcua.rejected", {
        sha1: clientCertificate.sha1,
        sha256: clientCertificate.sha256,
      });
}
