import { beforeAll, describe, expect, it } from "vitest";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const NONE = { securityMode: "None", securityPolicy: "None" } as const;

describe("how a session ends", () => {
  it("reports timeout, and closes the session, when the PLC goes silent for the watchdog", async () => {
    // The relay forwards nothing once stalled, like a cable pulled out: no close, no error.
    // The relay's own upstream socket is not a module's, so the socket guard is off here.
    const harness = await startHarness({
      pki,
      viaProxy: true,
      module: { ...NONE, publishingMilliseconds: 20, watchdogMilliseconds: 300 },
      session: { guardSockets: () => () => undefined },
    });
    harness.sessions.start();
    await harness.status((status) => status.connected);

    harness.proxy?.stall();
    await harness.status((status) => !status.connected);

    expect(harness.bus.statuses).toEqual([
      { connected: true, reason: null },
      { connected: false, reason: "timeout" },
    ]);
  }, 30_000);

  it.each([
    ["checking the nodes", "ReadRequest"],
    ["creating the subscription", "CreateSubscriptionRequest"],
  ])(
    "stops at once when the PLC goes silent while the bridge is %s",
    async (_step, request) => {
      const harness = await startHarness({
        pki,
        viaProxy: true,
        module: NONE,
        session: { guardSockets: () => () => undefined },
      });
      const silenced = harness.server.firstRequest(request).then(() => harness.proxy?.stall());
      harness.sessions.start();
      await silenced;

      const started = performance.now();
      await harness.sessions.stop();

      // The node-opcua request timeout is far above this: only the race ends the wait.
      expect(performance.now() - started).toBeLessThan(2500);
      expect(harness.bus.statuses).toEqual([]);
    },
    30_000,
  );

  it("keeps a quiet but healthy PLC connected: keep-alives feed the watchdog", async () => {
    const harness = await startHarness({
      pki,
      module: { ...NONE, publishingMilliseconds: 20, watchdogMilliseconds: 300 },
    });
    harness.sessions.start();
    await harness.status((status) => status.connected);

    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(harness.bus.statuses).toEqual([{ connected: true, reason: null }]);
  });

  it("stops without reporting anything more", async () => {
    const harness = await startHarness({ pki, module: NONE });
    harness.sessions.start();
    await harness.status((status) => status.connected);

    await harness.sessions.stop();

    expect(harness.bus.statuses).toEqual([{ connected: true, reason: null }]);
  });
});
