import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_RETRY_TIMINGS } from "../retry-policy.ts";
import { SECURE_MODULE, SECURE_SERVER } from "../test-support/secure-plc.ts";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const FAST_RETRIES = { ...DEFAULT_RETRY_TIMINGS, fixedMilliseconds: 100 };

describe("the PLC refuses Pantin's certificate", () => {
  it("reports certificate_rejected with both thumbprints, and connects at the next retry once the PLC trusts it", async () => {
    const harness = await startHarness({
      pki,
      server: SECURE_SERVER,
      module: SECURE_MODULE,
      session: { retry: FAST_RETRIES },
    });
    await pki.certificateManager.trustCertificate(harness.server.certificateDer());

    harness.sessions.start();
    await harness.status((status) => !status.connected);
    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "certificate_rejected" }]);
    const { sha1, sha256 } = pki.clientCertificate;
    expect(harness.logLines.join("\n")).toContain(
      `The PLC refused Pantin's certificate (SHA-1 ${sha1}, SHA-256 ${sha256}). Trust it in the PLC's OPC UA security settings; Pantin retries every 10 s.`,
    );

    await harness.server.trustClient(await readFile(pki.certificateFile));
    await harness.status((status) => status.connected);

    expect(harness.bus.statuses).toEqual([
      { connected: false, reason: "certificate_rejected" },
      { connected: true, reason: null },
    ]);
  }, 30_000);
});

describe("a trusted certificate that does not name the target", () => {
  it("is accepted, with a warning", async () => {
    const harness = await startHarness({ pki, server: SECURE_SERVER, module: SECURE_MODULE });
    await harness.server.trustClient(await readFile(pki.certificateFile));
    await pki.certificateManager.trustCertificate(harness.server.certificateDer());

    harness.sessions.start();
    await harness.status((status) => status.connected);

    expect(harness.logLines).toContain(
      "Module plc: the PLC's certificate does not name 127.0.0.1. It is accepted because it is trusted by its thumbprint.",
    );
  }, 30_000);
});
