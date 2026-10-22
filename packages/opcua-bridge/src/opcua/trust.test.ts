import { X509Certificate } from "node:crypto";
import { chmod, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Logger } from "../logger.ts";
import { startTestPlcServer } from "../test-support/plc-server.ts";
import { temporaryFolders } from "../test-support/temporary-folder.ts";
import { preparePki } from "./pki.ts";
import { sha256Of } from "./server-certificate.ts";
import { trustRequested } from "./trust.ts";

const newFolder = temporaryFolders();
const fileSystem = { mkdir, chmod, stat, readFile, readdir, link, rm };

function recordingLog(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const at = (level: string) => (message: string) => lines.push(`${level} ${message}`);
  return {
    lines,
    debug: at("DEBUG"),
    info: at("INFO"),
    warning: at("WARNING"),
    error: at("ERROR"),
  };
}

// Two certificates in `rejected/`, as two PLCs that were refused would leave them.
async function pkiWithTwoRejected() {
  const pki = await preparePki({
    directory: join(await newFolder(), "pki"),
    hostname: "workshop",
    platform: "linux",
    fileSystem,
  });
  const certificates: X509Certificate[] = [];
  for (let index = 0; index < 2; index += 1) {
    const plc = await startTestPlcServer({ pkiFolder: await newFolder(), variables: [] });
    certificates.push(new X509Certificate(plc.certificateDer()));
    await pki.certificateManager.rejectCertificate(plc.certificateDer());
    await plc.stop();
  }
  return { pki, certificates };
}

let setUp: Awaited<ReturnType<typeof pkiWithTwoRejected>>;
beforeAll(async () => {
  setUp = await pkiWithTwoRejected();
}, 30_000);

describe("trustRequested", () => {
  it("trusts the rejected certificate whose SHA-256 matches, and only that one", async () => {
    const { pki, certificates } = setUp;
    const [wanted, other] = certificates as [X509Certificate, X509Certificate];
    const log = recordingLog();

    await trustRequested(pki, [sha256Of(wanted)], fileSystem, log);

    const status = async (certificate: X509Certificate) =>
      (await pki.certificateManager.getTrustStatus(certificate.raw)).toString();
    expect(await status(wanted)).toMatch(/Good/);
    expect(await status(other)).not.toMatch(/Good/);
    expect(log.lines.join("\n")).toContain(`Trusted the server certificate ${sha256Of(wanted)}`);
  });

  it("warns and trusts nothing for a thumbprint that matches no rejected certificate", async () => {
    const { pki, certificates } = setUp;
    const [, other] = certificates as [X509Certificate, X509Certificate];
    const log = recordingLog();

    await trustRequested(pki, ["cd".repeat(32)], fileSystem, log);

    expect((await pki.certificateManager.getTrustStatus(other.raw)).toString()).not.toMatch(/Good/);
    expect(log.lines.join("\n")).toContain("nothing was trusted");
  });
});
