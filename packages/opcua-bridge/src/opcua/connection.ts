import { X509Certificate } from "node:crypto";
import type { ClientSession, OPCUAClient } from "node-opcua-client";
import { deferred } from "../deferred.ts";
import { ServerCertificateInvalidError } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type { ModulePlan } from "../module-plan.ts";
import { createClient, identityOf, SECURITY_MODES, SECURITY_POLICIES } from "./client-options.ts";
import { explainFailure } from "./connection-failure.ts";
import type { Pki } from "./pki.ts";
import {
  applicationUriProblem,
  certificateNamesAddress,
  describeServerCertificate,
} from "./server-certificate.ts";

// One OPC UA connection to one PLC server: the client, its session, and the moment it is lost
// (ADR 0065 points 2 and 5). The bridge owns the retries, so node-opcua's own are off.

export type Connection = {
  session: ClientSession;
  /** Settles when the connection or the session is gone, whoever ended it. */
  lost: Promise<void>;
  /** Closes the session and the connection; never rejects. */
  close(): Promise<void>;
};

function closeQuietly(client: OPCUAClient, session: ClientSession | null): () => Promise<void> {
  return async () => {
    try {
      await session?.close();
    } catch {
      // The connection may already be gone: closing the client below is what matters.
    }
    try {
      await client.disconnect();
    } catch {
      // Nothing more can be done for a client that cannot disconnect.
    }
  };
}

function offeredCertificate(client: OPCUAClient): X509Certificate | null {
  const offered = client.serverCertificate;
  const first = Array.isArray(offered) ? offered[0] : offered;
  return first === undefined || first.length === 0 ? null : new X509Certificate(first);
}

// The application URI the server announced in the endpoint matching the module's security.
function announcedUri(client: OPCUAClient, module: ModulePlan): string {
  const endpoint = client.findEndpointForSecurity(
    SECURITY_MODES[module.transport.securityMode],
    SECURITY_POLICIES[module.transport.securityPolicy],
  );
  return endpoint?.server.applicationUri ?? "";
}

// node-opcua checks that the certificate is trusted and in date, not whom it was made for. An
// application URI that is not the server's is refused, whatever `--trust` says; a host name
// that is not the target's is only a warning, since the identity comes from the pinned
// thumbprint and targets are IP literals (point 10).
function checkOfferedCertificate(client: OPCUAClient, module: ModulePlan, log: Logger): void {
  const certificate = module.transport.securityMode === "None" ? null : offeredCertificate(client);
  if (certificate === null) {
    return;
  }
  const problem = applicationUriProblem(certificate, announcedUri(client, module));
  if (problem !== null) {
    throw new ServerCertificateInvalidError(
      `Module ${module.key}: the PLC's certificate is refused. ${problem} Trusting it does not help: fix the certificate or the application URI in the PLC.`,
      { certificate: describeServerCertificate(certificate, problem), module: module.key },
    );
  }
  if (!certificateNamesAddress(certificate, module.target)) {
    log.warning(
      `Module ${module.key}: the PLC's certificate does not name ${module.target}. It is accepted because it is trusted by its thumbprint.`,
    );
  }
}

/**
 * Connects and opens the session. Rejects with a BridgeError for a failure that ends the bridge
 * (server certificate, login), a ClientCertificateRefusedError when the PLC refuses Pantin's
 * certificate, and the library's own error for anything else.
 */
export async function openConnection(
  module: ModulePlan,
  pki: Pki,
  log: Logger,
): Promise<Connection> {
  const client = createClient(module, pki);
  const lost = deferred<void>();
  client.once("connection_lost", () => lost.resolve());
  client.once("close", () => lost.resolve());
  try {
    await client.connect(module.endpoint);
    checkOfferedCertificate(client, module, log);
    const session = await client.createSession(identityOf(module.login));
    session.once("session_closed", () => lost.resolve());
    return { session, lost: lost.promise, close: closeQuietly(client, session) };
  } catch (error) {
    await closeQuietly(client, null)();
    throw await explainFailure(error, module, pki);
  }
}
