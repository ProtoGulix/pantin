import { X509Certificate } from "node:crypto";
import { chmod, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigurationError } from "../errors.ts";
import { temporaryFolders } from "../test-support/temporary-folder.ts";
import { applicationUriOf, type PkiFileSystem, preparePki } from "./pki.ts";

const newFolder = temporaryFolders();
const REAL: PkiFileSystem = { mkdir, chmod, stat, readFile, readdir, link, rm };

async function prepare(
  directory: string,
  fileSystem: PkiFileSystem = REAL,
  platform: NodeJS.Platform = "linux",
) {
  return preparePki({ directory, hostname: "workshop", platform, fileSystem });
}

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

describe("preparePki", () => {
  it("creates the folder as 0700 and the private key as 0600", async () => {
    const directory = join(await newFolder(), "pki");

    await prepare(directory);

    expect(await modeOf(directory)).toBe(0o700);
    expect(await modeOf(join(directory, "own", "private", "private_key.pem"))).toBe(0o600);
  }, 30_000);

  it("tightens a folder that was too open", async () => {
    const directory = await newFolder();
    await chmod(directory, 0o755);

    await prepare(directory);

    expect(await modeOf(directory)).toBe(0o700);
  }, 30_000);

  it("creates Pantin's certificate with its URI, and reports its thumbprints", async () => {
    const directory = await newFolder();

    const pki = await prepare(directory);

    const pem = await readFile(join(directory, "own", "certs", "client_certificate.pem"));
    const certificate = new X509Certificate(pem);
    expect(pki.applicationUri).toBe("urn:pantin:workshop:opcua-bridge");
    expect(applicationUriOf("workshop")).toBe(pki.applicationUri);
    expect(certificate.subjectAltName).toContain("URI:urn:pantin:workshop:opcua-bridge");
    expect(pki.clientCertificate.sha256).toBe(
      certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
    );
    expect(pki.clientCertificate.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pki.clientCertificate.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(pki.clientCertificate.sha1).toBe(
      certificate.fingerprint.replaceAll(":", "").toLowerCase(),
    );
    expect(pki.clientCertificate.subject).toContain("Pantin OPC UA bridge");
    expect(pki.clientCertificate.applicationUri).toBe(pki.applicationUri);
    expect(pki.certificateFile).toBe(join(directory, "own", "certs", "client_certificate.pem"));
  }, 30_000);

  it("keeps the same certificate at the next start", async () => {
    const directory = await newFolder();

    const first = await prepare(directory);
    const second = await prepare(directory);

    expect(second.clientCertificate).toEqual(first.clientCertificate);
  }, 30_000);

  it("lets two bridges start at once on one PKI folder, with one certificate", async () => {
    const directory = await newFolder();

    const [first, second] = await Promise.all([prepare(directory), prepare(directory)]);

    expect(second.clientCertificate).toEqual(first.clientCertificate);
  }, 30_000);

  it("refuses to start when the folder cannot be made private", async () => {
    const failing: PkiFileSystem = {
      ...REAL,
      chmod: () => Promise.reject(new Error("EPERM: operation not permitted")),
    };

    const attempt = prepare(await newFolder(), failing);

    await expect(attempt).rejects.toThrow(ConfigurationError);
    await expect(attempt).rejects.toThrow(/Cannot make the PKI folder .* private \(EPERM/);
  });

  it("refuses to start when a chmod that succeeds leaves the folder open", async () => {
    const ignoringChmod: PkiFileSystem = { ...REAL, chmod: () => Promise.resolve() };
    const directory = await newFolder();
    await chmod(directory, 0o755);

    await expect(prepare(directory, ignoringChmod)).rejects.toThrow(/its mode is 755, not 700/);
  });

  it("refuses to start when the private key cannot be made private", async () => {
    const failingOnKey: PkiFileSystem = {
      ...REAL,
      chmod: (path, mode) =>
        path.endsWith("private_key.pem") ? Promise.reject(new Error("EPERM")) : chmod(path, mode),
    };

    const attempt = prepare(await newFolder(), failingOnKey);

    await expect(attempt).rejects.toThrow(ConfigurationError);
    await expect(attempt).rejects.toThrow(/PKI private key/);
  }, 30_000);

  it("refuses to start when the folder cannot be created", async () => {
    const failing: PkiFileSystem = { ...REAL, mkdir: () => Promise.reject(new Error("EACCES")) };

    await expect(prepare("/nowhere", failing)).rejects.toThrow(/Cannot create the PKI folder/);
  });

  it("does not check POSIX modes on Windows", async () => {
    const calls: string[] = [];
    const recording: PkiFileSystem = {
      ...REAL,
      chmod: (path, mode) => {
        calls.push(path);
        return chmod(path, mode);
      },
    };

    await prepare(await newFolder(), recording, "win32");

    expect(calls).toEqual([]);
  }, 30_000);
});
