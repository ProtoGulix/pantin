import {
  AuthenticationFailedError,
  ServerCertificateInvalidError,
  UntrustedServerCertificateError,
} from "../errors.ts";
import type { ModulePlan } from "../module-plan.ts";
import type { Pki } from "./pki.ts";
import { describeServerCertificate, validityProblem } from "./server-certificate.ts";
import { fetchServerCertificate } from "./server-discovery.ts";

// What a failed connection means (ADR 0065 points 9 and 10). node-opcua reports most of these
// as plain errors whose message ends in the status name, so the status name is read from it.

export type ConnectionFailure =
  | { kind: "server_certificate_untrusted" }
  | { kind: "server_certificate_refused"; status: string }
  | { kind: "client_certificate_refused" }
  | { kind: "login_refused" }
  | { kind: "other" };

/** The PLC did not accept Pantin's certificate; trusting it in the PLC is the fix. */
export class ClientCertificateRefusedError extends Error {}

const STATUS_NAME = /\bBad[A-Za-z0-9]+/;
// The statuses a server answers when it does not trust the client's certificate.
const CLIENT_CERTIFICATE_STATUSES = new Set(["BadSecurityChecksFailed", "BadCertificateUntrusted"]);
const LOGIN_STATUSES = new Set([
  "BadUserAccessDenied",
  "BadIdentityTokenRejected",
  "BadIdentityTokenInvalid",
]);
const NO_TOKEN_POLICY = /Cannot find (ANONYMOUS|USERNAME) user token policy/;

/** Pure: reads the library's error and the module's security setting. */
export function classifyConnectionFailure(error: unknown, secure: boolean): ConnectionFailure {
  const message = error instanceof Error ? error.message : String(error);
  const status = STATUS_NAME.exec(message)?.[0] ?? "";
  if (message.includes("server Certificate verification failed")) {
    return status === "BadCertificateUntrusted"
      ? { kind: "server_certificate_untrusted" }
      : { kind: "server_certificate_refused", status };
  }
  if (secure && message.includes("rejected by server") && CLIENT_CERTIFICATE_STATUSES.has(status)) {
    return { kind: "client_certificate_refused" };
  }
  if (LOGIN_STATUSES.has(status) || NO_TOKEN_POLICY.test(message)) {
    return { kind: "login_refused" };
  }
  return { kind: "other" };
}

/** The message the user reads when the PLC refuses Pantin's certificate (point 10). */
function clientCertificateRefusedMessage(pki: Pki): string {
  const { sha1, sha256 } = pki.clientCertificate;
  return `The PLC refused Pantin's certificate (SHA-1 ${sha1}, SHA-256 ${sha256}). Trust it in the PLC's OPC UA security settings; Pantin retries every 10 s.`;
}

function loginMessage(module: ModulePlan): string {
  return module.login.kind === "anonymous"
    ? `Module ${module.key}: the PLC does not accept anonymous access. Give the module a user name in the I/O view.`
    : `Module ${module.key}: the PLC refused the user name or password. Start the bridge again from the viewer and type the password again.`;
}

async function untrustedError(
  module: ModulePlan,
  pki: Pki,
): Promise<UntrustedServerCertificateError> {
  const offered = await fetchServerCertificate(module, pki);
  const certificate =
    offered === null
      ? null
      : describeServerCertificate(offered, "The certificate is not trusted yet.");
  const shown = certificate === null ? "" : ` (SHA-256 ${certificate.sha256})`;
  return new UntrustedServerCertificateError(
    `Module ${module.key}: the PLC's certificate${shown} is not trusted. Compare it with the one in the PLC, then trust it from the viewer (Trust and restart) or start the bridge with --trust <sha256>.`,
    { certificate, module: module.key },
  );
}

async function refusedError(
  module: ModulePlan,
  pki: Pki,
  status: string,
  now: Date,
): Promise<ServerCertificateInvalidError> {
  const certificate = await fetchServerCertificate(module, pki);
  const reason =
    (status === "BadCertificateTimeInvalid" && certificate !== null
      ? validityProblem(certificate, now)
      : null) ?? `node-opcua refused the certificate: ${status}.`;
  return new ServerCertificateInvalidError(
    `Module ${module.key}: the PLC's certificate is refused. ${reason} Trusting it does not help: renew the certificate in the PLC.`,
    {
      certificate: certificate === null ? null : describeServerCertificate(certificate, reason),
      module: module.key,
    },
  );
}

/** The error to throw for a failed connection: a typed one when the failure is understood. */
export async function explainFailure(
  error: unknown,
  module: ModulePlan,
  pki: Pki,
  now: Date = new Date(),
): Promise<unknown> {
  const failure = classifyConnectionFailure(error, module.transport.securityMode !== "None");
  switch (failure.kind) {
    case "server_certificate_untrusted":
      return untrustedError(module, pki);
    case "server_certificate_refused":
      return refusedError(module, pki, failure.status, now);
    case "client_certificate_refused":
      return new ClientCertificateRefusedError(clientCertificateRefusedMessage(pki));
    case "login_refused":
      return new AuthenticationFailedError(loginMessage(module), module.key);
    case "other":
      return error;
  }
}
