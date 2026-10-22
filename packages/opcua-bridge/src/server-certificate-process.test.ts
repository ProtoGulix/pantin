import { X509Certificate } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Pki } from "./opcua/pki.ts";
import { sha256Of } from "./opcua/server-certificate.ts";
import { exitingLineOf, startScenario } from "./test-support/bridge-scenario.ts";
import { startTestPlcServer, type TestPlcOptions } from "./test-support/plc-server.ts";
import { SECURE_MODULE, SECURE_SERVER } from "./test-support/secure-plc.ts";
import { createTestPki } from "./test-support/session-harness.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// ADR 0065 point 10 on the whole program: what the exiting line says about the PLC's certificate,
// and that the thumbprint given to --trust, and nothing else, makes the next start connect.

const newFolder = temporaryFolders();
const CONNECTED = { type: "plc_status", module: "plc", connected: true, reason: null };

// The child builds its application URI from the host name, so the PKI the test prepares must too.
async function setUp(server: Partial<TestPlcOptions> = {}) {
  const pki: Pki = await createTestPki(hostname());
  const plc = await startTestPlcServer({
    ...SECURE_SERVER,
    pkiFolder: await newFolder(),
    ...server,
  });
  await plc.trustClient(await readFile(pki.certificateFile));
  return { pki, plc, pkiDirectory: pki.certificateManager.rootDir };
}

describe("an unknown server certificate", () => {
  it("ends the bridge with the certificate, then --trust with its thumbprint connects", async () => {
    const { plc, pkiDirectory } = await setUp();
    const sha256 = sha256Of(new X509Certificate(plc.certificateDer()));

    const first = await startScenario({ pkiDirectory, port: plc.port, module: SECURE_MODULE });
    expect(await first.bridge.exited).toBe(1);

    expect(exitingLineOf(first.bridge)).toMatchObject({
      kind: "untrusted_server_certificate",
      module: "plc",
      certificate: { sha256, reason: expect.stringContaining("not trusted") },
    });
    expect(await readdir(join(pkiDirectory, "trusted", "certs"))).toEqual([]);

    const second = await startScenario({
      pkiDirectory,
      port: plc.port,
      module: SECURE_MODULE,
      trust: [sha256],
    });
    await second.core.untilMessage(
      (message) => JSON.stringify(message) === JSON.stringify(CONNECTED),
    );
    second.bridge.child.kill("SIGTERM");
    expect(await second.bridge.exited).toBe(0);
  }, 60_000);

  it("trusts nothing when the thumbprint matches no rejected certificate", async () => {
    const { plc, pkiDirectory } = await setUp();
    const first = await startScenario({ pkiDirectory, port: plc.port, module: SECURE_MODULE });
    await first.bridge.exited;

    const second = await startScenario({
      pkiDirectory,
      port: plc.port,
      module: SECURE_MODULE,
      trust: ["ab".repeat(32)],
    });

    expect(await second.bridge.exited).toBe(1);
    expect(exitingLineOf(second.bridge).kind).toBe("untrusted_server_certificate");
    expect(second.bridge.stderr.join("\n")).toContain("nothing was trusted");
  }, 60_000);
});

describe("a server certificate that is refused whatever the user trusts", () => {
  const DAY = 86_400_000;

  it.each([
    ["expired", { startDate: new Date(Date.now() - 400 * DAY), validityDays: 30 }, "expired"],
    [
      "not yet valid",
      { startDate: new Date(Date.now() + 40 * DAY), validityDays: 30 },
      "not valid before",
    ],
    [
      "made for another application",
      { startDate: new Date(), validityDays: 30, applicationUri: "urn:other:thing" },
      "made for urn:other:thing",
    ],
  ])(
    "ends the bridge with server_certificate_invalid when it is %s",
    async (_name, certificate, text) => {
      const { pki, plc, pkiDirectory } = await setUp({ certificate });
      await pki.certificateManager.trustCertificate(plc.certificateDer());
      const sha256 = sha256Of(new X509Certificate(plc.certificateDer()));

      const run = await startScenario({
        pkiDirectory,
        port: plc.port,
        module: SECURE_MODULE,
        trust: [sha256],
      });

      expect(await run.bridge.exited).toBe(1);
      expect(exitingLineOf(run.bridge)).toMatchObject({
        kind: "server_certificate_invalid",
        module: "plc",
        certificate: { sha256, reason: expect.stringContaining(text) },
      });
    },
    60_000,
  );
});
