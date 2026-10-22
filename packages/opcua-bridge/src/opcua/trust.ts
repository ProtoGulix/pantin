import { X509Certificate } from "node:crypto";
import { join } from "node:path";
import type { Logger } from "../logger.ts";
import type { Pki } from "./pki.ts";
import { sha256Of, subjectOf } from "./server-certificate.ts";

// `--trust <sha256>` (ADR 0065 point 10): the user has seen a rejected certificate's thumbprint
// and agrees. The bridge hashes the certificates in `rejected/` itself and trusts only an exact
// match; it never trusts a certificate it was not told about, so there is no trust on first use.

export type RejectedFolder = {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<Buffer>;
};

async function readRejected(
  folder: RejectedFolder,
  directory: string,
  log: Logger,
): Promise<X509Certificate[]> {
  const names = await folder.readdir(directory).catch(() => [] as string[]);
  const certificates: X509Certificate[] = [];
  for (const name of names) {
    try {
      certificates.push(new X509Certificate(await folder.readFile(join(directory, name))));
    } catch {
      log.debug(`Ignoring ${name} in the rejected certificates: it is not a certificate.`);
    }
  }
  return certificates;
}

/** Moves each certificate named by `trusted` from `rejected/` to `trusted/`. */
export async function trustRequested(
  pki: Pki,
  trusted: readonly string[],
  folder: RejectedFolder,
  log: Logger,
): Promise<void> {
  if (trusted.length === 0) {
    return;
  }
  const rejected = await readRejected(
    folder,
    join(pki.certificateManager.rootDir, "rejected"),
    log,
  );
  for (const sha256 of trusted) {
    const match = rejected.find((certificate) => sha256Of(certificate) === sha256);
    if (match === undefined) {
      log.warning(
        `--trust ${sha256}: no rejected certificate has this SHA-256, so nothing was trusted. Start the bridge without --trust to see the PLC's certificate again.`,
      );
      continue;
    }
    await pki.certificateManager.trustCertificate(match.raw);
    log.info(`Trusted the server certificate ${sha256} (${subjectOf(match)}) as asked by --trust.`);
  }
}
