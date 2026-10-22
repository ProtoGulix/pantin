import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthenticationFailedError } from "../errors.ts";
import { trustEachOther } from "../test-support/plc-server.ts";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const SECURE = {
  securityModes: [MessageSecurityMode.SignAndEncrypt],
  securityPolicies: [SecurityPolicy.Basic256Sha256],
} as const;

async function feedbackReachesThePlc(harness: Awaited<ReturnType<typeof startHarness>>) {
  harness.sessions.start();
  await harness.status((status) => status.connected);
  harness.feedback("tags", [["press.cylinder.extended", 1]]);
  await harness.server.until("plc_out", (value) => value === 1);
}

describe("secure sessions", () => {
  it("opens SignAndEncrypt with Basic256Sha256 anonymously", async () => {
    const harness = await startHarness({ pki, server: SECURE });
    await trustEachOther(pki, harness.server);

    await feedbackReachesThePlc(harness);

    expect(harness.bus.statuses).toEqual([{ connected: true, reason: null }]);
  }, 30_000);

  it("opens a Sign session with Basic256Sha256: signed, not encrypted", async () => {
    const harness = await startHarness({
      pki,
      server: {
        securityModes: [MessageSecurityMode.Sign],
        securityPolicies: [SecurityPolicy.Basic256Sha256],
      },
      module: { securityMode: "Sign", securityPolicy: "Basic256Sha256" },
    });
    await trustEachOther(pki, harness.server);

    await feedbackReachesThePlc(harness);

    expect(harness.bus.statuses).toEqual([{ connected: true, reason: null }]);
  }, 30_000);

  it("logs in as a user with the password of the plan", async () => {
    const harness = await startHarness({
      pki,
      server: { ...SECURE, users: { operator: "s3cret-pw" } },
      module: { userName: "operator" },
      password: "s3cret-pw",
    });
    await trustEachOther(pki, harness.server);

    await feedbackReachesThePlc(harness);

    expect(harness.logLines.join("\n")).not.toContain("s3cret-pw");
  }, 30_000);

  it("reports a fatal authentication failure, and logs no password, when the server refuses the login", async () => {
    const harness = await startHarness({
      pki,
      server: { ...SECURE, users: { operator: "s3cret-pw" } },
      module: { userName: "operator" },
      password: "wrong-pw-0",
    });
    await trustEachOther(pki, harness.server);

    harness.sessions.start();
    const failure = await harness.sessions.failed;

    expect(failure).toBeInstanceOf(AuthenticationFailedError);
    expect(failure.details.module).toBe("plc");
    expect(harness.bus.statuses).toEqual([]);
    expect(harness.logLines.join("\n")).not.toContain("wrong-pw-0");
  }, 30_000);
});
