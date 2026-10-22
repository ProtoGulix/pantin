import {
  BRIDGE_MAX_STATUS_LINE_BYTES,
  type BridgeClientCertificate,
  type BridgeExitKind,
  type BridgeStatusLine,
  OPCUA_CLIENT_KIND,
} from "@pantin/protocol";
import { type ExitDetails, exitDetailsOf, exitKindOf } from "./errors.ts";
import type { StatusLineWriter } from "./stdout-guard.ts";

// The JSON lines the bridge writes on stdout under --status-lines (ADR 0050 point 2, ADR 0065
// point 7). The shape is held by packages/protocol/fixtures/bridge-status-lines.json.

export type ReadyModule = { key: string; endpoint: string };

function encode(line: BridgeStatusLine): string {
  return JSON.stringify(line);
}

export function encodeReadyLine(
  modules: readonly ReadyModule[],
  clientCertificate: BridgeClientCertificate,
): string {
  return encode({
    event: "ready",
    transport: OPCUA_CLIENT_KIND,
    modules: [...modules],
    clientCertificate,
  });
}

function exitingLine(kind: BridgeExitKind, message: string, details: ExitDetails): string {
  return encode({
    event: "exiting",
    kind,
    message,
    certificate: details.certificate,
    module: details.module,
  });
}

const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

const fits = (line: string): boolean => byteLength(line) <= BRIDGE_MAX_STATUS_LINE_BYTES;

// The certificate, then the certificate without its free text, then no certificate: each
// costs the supervisor less detail than the previous one and is smaller by construction (the
// remaining fields are dates, thumbprints and a module key, all of a fixed or schema-bounded size).
function detailsByDecreasingSize(details: ExitDetails): ExitDetails[] {
  const { certificate } = details;
  if (certificate === null) {
    return [details];
  }
  return [
    details,
    { ...details, certificate: { ...certificate, subject: "", reason: "" } },
    { ...details, certificate: null },
  ];
}

/**
 * A line over the limit would be read as a log line, so it is shortened until it fits: first
 * the message, then, if even an empty message does not fit, the certificate's text.
 * It terminates by construction: the candidates are a fixed list, and the message loop removes
 * at least one character per round, so it ends at the empty message, which fits in the last
 * candidate. The cut is measured on the encoded line: JSON escapes a control character as 6 bytes.
 */
export function encodeExitingLine(
  kind: BridgeExitKind,
  message: string,
  details: ExitDetails = { certificate: null, module: null },
): string {
  const candidates = detailsByDecreasingSize(details);
  // The last candidate carries no certificate and fits with an empty message; the final
  // fallback only satisfies the type checker, since `candidates` is never empty.
  const chosen =
    candidates.find((candidate) => fits(exitingLine(kind, "", candidate))) ??
    candidates.at(-1) ??
    details;
  let kept = message;
  let line = exitingLine(kind, kept, chosen);
  while (!fits(line) && kept.length > 0) {
    const excess = byteLength(line) - BRIDGE_MAX_STATUS_LINE_BYTES;
    kept = kept.slice(0, Math.max(0, kept.length - Math.max(1, Math.floor(excess / 6))));
    line = exitingLine(kind, kept, chosen);
  }
  return line;
}

export type StatusLines = {
  ready(modules: readonly ReadyModule[], clientCertificate: BridgeClientCertificate): Promise<void>;
  exiting(error: unknown): Promise<void>;
};

/** Writes nothing when `write` is null: a manual run without --status-lines. */
export function createStatusLines(write: StatusLineWriter | null): StatusLines {
  return {
    ready: async (modules, clientCertificate) => {
      await write?.(encodeReadyLine(modules, clientCertificate));
    },
    exiting: async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await write?.(encodeExitingLine(exitKindOf(error), message, exitDetailsOf(error)));
    },
  };
}
