import { randomUUID, X509Certificate } from "node:crypto";
import { join } from "node:path";
import type { BridgeClientCertificate } from "@pantin/protocol";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { ConfigurationError } from "../errors.ts";
import { sha1Of, sha256Of, subjectOf } from "./server-certificate.ts";

// Pantin's own PKI (ADR 0065 point 10): the folder, the private key and the certificate the
// bridge presents to a PLC server. node-opcua is confined to the src/opcua/ folder.

const DIRECTORY_MODE = 0o700;
const KEY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
// 10 years, like node-opcua's own default for a client certificate.
const CERTIFICATE_VALIDITY_DAYS = 365 * 10;

/** The file system calls the bridge makes itself, injected so that a refusal can be tested. */
export type PkiFileSystem = {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  chmod(path: string, mode: number): Promise<void>;
  stat(path: string): Promise<{ mode: number }>;
  readFile(path: string): Promise<Buffer>;
  readdir(path: string): Promise<string[]>;
  link(existingPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
};

export type PkiOptions = {
  directory: string;
  hostname: string;
  platform: NodeJS.Platform;
  fileSystem: PkiFileSystem;
};

export type Pki = {
  /** The one certificate manager of the bridge: nothing is written to the home directory. */
  certificateManager: OPCUACertificateManager;
  certificateFile: string;
  applicationUri: string;
  clientCertificate: BridgeClientCertificate;
};

export function applicationUriOf(hostname: string): string {
  return `urn:pantin:${hostname}:opcua-bridge`;
}

// Windows has no POSIX modes: the folder inherits the access list of the user's profile
// (NOT VERIFIED, ADR 0065 point 10), so only the permission bits of other systems are checked.
async function requirePrivate(
  options: PkiOptions,
  path: string,
  mode: number,
  what: string,
): Promise<void> {
  if (options.platform === "win32") {
    return;
  }
  try {
    await options.fileSystem.chmod(path, mode);
    const actual = (await options.fileSystem.stat(path)).mode & PERMISSION_BITS;
    if (actual !== mode) {
      throw new Error(`its mode is ${actual.toString(8)}, not ${mode.toString(8)}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(
      `Cannot make the PKI ${what} "${path}" private (${reason}). The bridge does not start with a private key that others could read: fix the permissions, or choose another folder with --opcua-pki-dir on the core.`,
    );
  }
}

async function createDirectory(options: PkiOptions): Promise<void> {
  try {
    await options.fileSystem.mkdir(options.directory, { recursive: true, mode: DIRECTORY_MODE });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(
      `Cannot create the PKI folder "${options.directory}" (${reason}). Choose another folder with --opcua-pki-dir on the core.`,
    );
  }
  await requirePrivate(options, options.directory, DIRECTORY_MODE, "folder");
}

function describeCertificate(pem: Buffer, applicationUri: string): BridgeClientCertificate {
  const certificate = new X509Certificate(pem);
  return {
    subject: subjectOf(certificate),
    applicationUri,
    sha256: sha256Of(certificate),
    sha1: sha1Of(certificate),
  };
}

// Two bridges may start at once on one folder. node-opcua locks its own writes but not our
// "is there a certificate?" test, so each one writes a candidate and publishes it with a hard
// link, which fails when a certificate is already there: the first one wins, the others read it.
async function createCertificateWhenMissing(
  options: PkiOptions,
  manager: OPCUACertificateManager,
  certificateFile: string,
  applicationUri: string,
): Promise<void> {
  const { fileSystem } = options;
  const exists = await fileSystem.stat(certificateFile).then(
    () => true,
    () => false,
  );
  if (exists) {
    return;
  }
  const candidate = join(options.directory, `client_certificate.${randomUUID()}.pending`);
  try {
    await manager.createSelfSignedCertificate({
      applicationUri,
      dns: [options.hostname],
      outputFile: candidate,
      subject: `/CN=Pantin OPC UA bridge@${options.hostname}`.slice(0, 80),
      startDate: new Date(),
      validity: CERTIFICATE_VALIDITY_DAYS,
    });
    await fileSystem.link(candidate, certificateFile).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    });
  } finally {
    await fileSystem.rm(candidate, { force: true });
  }
}

/**
 * Prepares the folder (0700), the private key (0600) and Pantin's certificate, created at the
 * first start. Throws a ConfigurationError, and the bridge does not start, if the folder or
 * the key cannot be made private.
 */
export async function preparePki(options: PkiOptions): Promise<Pki> {
  await createDirectory(options);
  const manager = new OPCUACertificateManager({ rootFolder: options.directory });
  await manager.initialize();
  const privateKeyFile = join(options.directory, "own", "private", "private_key.pem");
  await requirePrivate(options, privateKeyFile, KEY_MODE, "private key");
  const certificateFile = join(options.directory, "own", "certs", "client_certificate.pem");
  const applicationUri = applicationUriOf(options.hostname);
  await createCertificateWhenMissing(options, manager, certificateFile, applicationUri);
  return {
    certificateManager: manager,
    certificateFile,
    applicationUri,
    clientCertificate: describeCertificate(
      await options.fileSystem.readFile(certificateFile),
      applicationUri,
    ),
  };
}
