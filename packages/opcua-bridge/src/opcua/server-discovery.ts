import { X509Certificate } from "node:crypto";
import type { ModulePlan } from "../module-plan.ts";
import { createClient, SECURITY_MODES, SECURITY_POLICIES } from "./client-options.ts";
import type { Pki } from "./pki.ts";

// Reading the certificate a PLC server offers for the module's security setting, over a channel
// without security as the discovery services allow. node-opcua refuses an untrusted certificate
// without handing it over, and the user needs its details to decide (ADR 0065 point 10). Only
// used once a connection already failed on a certificate.

/** The server's certificate for the module's mode and policy, or null when it cannot be read. */
export async function fetchServerCertificate(
  module: ModulePlan,
  pki: Pki,
): Promise<X509Certificate | null> {
  const client = createClient(
    {
      ...module,
      transport: { ...module.transport, securityMode: "None", securityPolicy: "None" },
    },
    pki,
  );
  try {
    await client.connect(module.endpoint);
    const endpoints = await client.getEndpoints();
    const wanted = endpoints.find(
      (endpoint) =>
        endpoint.securityMode === SECURITY_MODES[module.transport.securityMode] &&
        endpoint.securityPolicyUri === SECURITY_POLICIES[module.transport.securityPolicy],
    );
    return wanted?.serverCertificate ? new X509Certificate(wanted.serverCertificate) : null;
  } catch {
    // The caller reports the failure without the details it could not get.
    return null;
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}
