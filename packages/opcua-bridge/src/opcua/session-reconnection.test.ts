import { beforeAll, describe, expect, it } from "vitest";
import { startTestPlcServer, type TestPlcServer } from "../test-support/plc-server.ts";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import { temporaryFolders } from "../test-support/temporary-folder.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const newFolder = temporaryFolders();
const NONE = { securityMode: "None", securityPolicy: "None" } as const;
const FAST_RETRIES = {
  firstBackoffMilliseconds: 20,
  maxBackoffMilliseconds: 100,
  fixedMilliseconds: 100,
};
const VARIABLES = [
  { name: "plc_extend", dataType: "Boolean", initial: 1 },
  { name: "plc_out", dataType: "Boolean" },
] as const;

// Starts the server again where the stopped one was, as a PLC that was restarted.
function restartServer(stopped: TestPlcServer, pkiFolder: string): Promise<TestPlcServer> {
  return startTestPlcServer({ pkiFolder, variables: VARIABLES, port: stopped.port });
}

describe("reconnection", () => {
  it("reconnects after the PLC restarts, subscribes again and writes all the feedback again", async () => {
    const pkiFolder = await newFolder();
    const harness = await startHarness({
      pki,
      module: NONE,
      server: { pkiFolder, variables: VARIABLES },
      session: { retry: FAST_RETRIES },
    });
    harness.sessions.start();
    await harness.status((status) => status.connected);
    harness.feedback("tags", [["press.cylinder.extended", 1]]);
    await harness.server.until("plc_out", (value) => value === 1);
    await harness.write((write) => write.tag === "press.valve.extend" && write.value === 1);

    await harness.server.stop();
    await harness.status((status) => !status.connected);
    const restarted = await restartServer(harness.server, pkiFolder);
    let statuses: typeof harness.bus.statuses = [];
    try {
      await harness.status(() => harness.bus.statuses.length >= 3);
      // The new PLC starts with its outputs off: the core's values are written again, unasked.
      await restarted.until("plc_out", (value) => value === 1);
      // The command it holds is read again and handed to the core, which zeroed it meanwhile.
      await harness.write(
        () => harness.bus.writes.filter((write) => write.value === 1).length >= 2,
      );
      const changed = harness.nextWrite((write) => write.value === 0);
      restarted.set("plc_extend", 0);
      await changed;
      statuses = [...harness.bus.statuses];
    } finally {
      await restarted.stop();
    }

    expect(statuses).toEqual([
      { connected: true, reason: null },
      { connected: false, reason: "closed" },
      { connected: true, reason: null },
    ]);
  }, 30_000);

  it("keeps trying while the PLC is not there, reporting closed once, and connects when it comes", async () => {
    const pkiFolder = await newFolder();
    const harness = await startHarness({
      pki,
      module: NONE,
      server: { pkiFolder, variables: VARIABLES },
      session: { retry: FAST_RETRIES },
    });
    await harness.server.stop();
    harness.sessions.start();
    await harness.logged(
      () => harness.logLines.filter((line) => line.includes("cannot open a session")).length >= 3,
    );

    const arrived = await restartServer(harness.server, pkiFolder);
    let statuses: typeof harness.bus.statuses = [];
    try {
      await harness.status((status) => status.connected);
      statuses = [...harness.bus.statuses];
    } finally {
      await arrived.stop();
    }

    expect(statuses).toEqual([
      { connected: false, reason: "closed" },
      { connected: true, reason: null },
    ]);
  }, 30_000);
});
