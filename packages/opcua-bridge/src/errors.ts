import type { BridgeExitKind, BridgeServerCertificate } from "@pantin/protocol";

// Typed errors of the bridge (CLAUDE.md section 8.6). Each one carries the `exiting` kind the
// core shows to the user, and a message that says what to do next. The kinds are the Python
// bridge's, so the core treats both bridges alike (ADR 0065 point 5).

export class BridgeError extends Error {
  readonly exitKind: BridgeExitKind;
  /** What the `exiting` line adds to the kind: the server certificate and the module at fault. */
  readonly details: ExitDetails;

  constructor(exitKind: BridgeExitKind, message: string, details: Partial<ExitDetails> = {}) {
    super(message);
    this.name = new.target.name;
    this.exitKind = exitKind;
    this.details = { certificate: details.certificate ?? null, module: details.module ?? null };
  }
}

export type ExitDetails = { certificate: BridgeServerCertificate | null; module: string | null };

/** The command line, the stdin line or the PKI folder break a rule of ADR 0004, 0046 or 0065. */
export class ConfigurationError extends BridgeError {
  constructor(message: string) {
    super("configuration", message);
  }
}

export class CoreUnavailableError extends BridgeError {
  constructor(message: string) {
    super("core_unavailable", message);
  }
}

/** The Pantin has no valid I/O mapping for this transport: there is nothing to bridge. */
export class MappingNotValidError extends BridgeError {
  constructor(message: string) {
    super("mapping_not_valid", message);
  }
}

/** The Pantin's tags changed (`io_changed`): the mapping the bridge serves may be stale. */
export class MappingChangedError extends BridgeError {
  constructor(message: string) {
    super("mapping_changed", message);
  }
}

/** The tag bus is gone or unusable: the bridge cannot go on and must be started again. */
export class BusClosedError extends BridgeError {
  constructor(message: string) {
    super("bus_closed", message);
  }
}

/** The core sent something the bridge's schemas refuse. */
export class ProtocolError extends BridgeError {
  constructor(message: string) {
    super("protocol", message);
  }
}

/** The PLC presented a certificate that is not trusted yet; `--trust <sha256>` accepts it. */
export class UntrustedServerCertificateError extends BridgeError {
  constructor(message: string, details: ExitDetails) {
    super("untrusted_server_certificate", message, details);
  }
}

/** The PLC's certificate is expired, not yet valid or names another application: no trust helps. */
export class ServerCertificateInvalidError extends BridgeError {
  constructor(message: string, details: ExitDetails) {
    super("server_certificate_invalid", message, details);
  }
}

/** The PLC refused the login: asking again with the same credentials would fail again. */
export class AuthenticationFailedError extends BridgeError {
  constructor(message: string, module: string) {
    super("authentication_failed", message, { module });
  }
}

export function exitKindOf(error: unknown): BridgeExitKind {
  return error instanceof BridgeError ? error.exitKind : "unexpected";
}

export function exitDetailsOf(error: unknown): ExitDetails {
  return error instanceof BridgeError ? error.details : { certificate: null, module: null };
}
