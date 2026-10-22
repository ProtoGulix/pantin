import type { X509Certificate } from "node:crypto";
import type { BridgeServerCertificate } from "@pantin/protocol";
import { boundedPlcText } from "../bounded-text.ts";

// What the bridge says about a PLC server's certificate (ADR 0065 point 10): thumbprints, the
// reason it was not accepted, and the checks node-opcua leaves to the caller. Pure functions of
// the certificate and of the time given.

const lowerHexWithoutColons = (colonSeparated: string): string =>
  colonSeparated.replaceAll(":", "").toLowerCase();

export const sha256Of = (certificate: X509Certificate): string =>
  lowerHexWithoutColons(certificate.fingerprint256);

export const sha1Of = (certificate: X509Certificate): string =>
  lowerHexWithoutColons(certificate.fingerprint);

export const subjectOf = (certificate: X509Certificate): string =>
  certificate.subject.replaceAll("\n", ", ");

export function describeServerCertificate(
  certificate: X509Certificate,
  reason: string,
): BridgeServerCertificate {
  return {
    subject: boundedPlcText(subjectOf(certificate)),
    notBefore: certificate.validFromDate.toISOString(),
    notAfter: certificate.validToDate.toISOString(),
    sha256: sha256Of(certificate),
    sha1: sha1Of(certificate),
    reason: boundedPlcText(reason),
  };
}

/** Why the certificate is not valid at `now`, or null when its dates include it. */
export function validityProblem(certificate: X509Certificate, now: Date): string | null {
  if (certificate.validToDate < now) {
    return `The certificate expired on ${certificate.validToDate.toISOString()}.`;
  }
  if (certificate.validFromDate > now) {
    return `The certificate is not valid before ${certificate.validFromDate.toISOString()}.`;
  }
  return null;
}

// OpenSSL writes the alternative names as "DNS:a, IP Address:1.2.3.4, URI:urn:x".
function alternativeNames(certificate: X509Certificate, prefix: string): string[] {
  return (certificate.subjectAltName ?? "")
    .split(", ")
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
}

/**
 * Why the certificate does not belong to the application the server announced, or null.
 * An empty announced URI, or a certificate without one, is not a mismatch the bridge can name.
 */
export function applicationUriProblem(
  certificate: X509Certificate,
  announcedUri: string,
): string | null {
  const uris = alternativeNames(certificate, "URI:");
  if (announcedUri === "" || uris.length === 0 || uris.includes(announcedUri)) {
    return null;
  }
  const made = boundedPlcText(uris.join(", "));
  return `The certificate is made for ${made} but the server announces itself as ${boundedPlcText(announcedUri)}.`;
}

/** True when the certificate lists the address the bridge dialled. */
export function certificateNamesAddress(certificate: X509Certificate, address: string): boolean {
  return certificate.checkIP(address) !== undefined || certificate.checkHost(address) !== undefined;
}
