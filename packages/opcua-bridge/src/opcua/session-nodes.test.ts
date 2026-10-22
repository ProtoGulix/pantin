import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_RETRY_TIMINGS } from "../retry-policy.ts";
import type { FixtureChannel } from "../test-support/projection-fixtures.ts";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const NONE = { securityMode: "None", securityPolicy: "None" } as const;
const PREFIX = "s=|var|App.GVL_Pantin.";
const command: FixtureChannel = {
  tag: "press.valve.extend",
  direction: "command",
  identifier: `${PREFIX}plc_extend`,
};
const feedback: FixtureChannel = {
  tag: "press.cylinder.extended",
  direction: "feedback",
  identifier: `${PREFIX}plc_out`,
};

async function mismatch(options: Parameters<typeof startHarness>[0]) {
  const harness = await startHarness(options);
  harness.sessions.start();
  await harness.status((status) => !status.connected);
  return harness;
}

const errors = (lines: readonly string[]) => lines.filter((line) => line.includes("Module plc:"));

describe("the node checks", () => {
  it("reports node_mismatch, with one line, when a node has another type", async () => {
    const harness = await mismatch({
      pki,
      server: {
        variables: [
          { name: "plc_extend", dataType: "Boolean" },
          { name: "plc_out", dataType: "Int16" },
        ],
      },
      module: { ...NONE, channels: [command, feedback] },
    });

    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "node_mismatch" }]);
    const lines = errors(harness.logLines);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("holds Int16 but its channel says BOOL");
    expect(lines[0]).toContain("press.cylinder.extended");
  });

  it("reports a node that does not exist", async () => {
    const harness = await mismatch({
      pki,
      server: { variables: [{ name: "plc_extend", dataType: "Boolean" }] },
      module: { ...NONE, channels: [command, feedback] },
    });

    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "node_mismatch" }]);
    expect(errors(harness.logLines)).toEqual([
      expect.stringContaining("plc_out (tag press.cylinder.extended) does not exist"),
    ]);
  });

  it("reports a feedback the PLC does not let Pantin write, and a command it does not let it read", async () => {
    const harness = await mismatch({
      pki,
      server: {
        variables: [
          { name: "plc_extend", dataType: "Boolean" },
          { name: "plc_out", dataType: "Boolean", access: "read" },
        ],
      },
      module: { ...NONE, channels: [command, feedback] },
    });

    expect(errors(harness.logLines)).toEqual([
      expect.stringContaining("does not let this user write"),
    ]);
  });
});

describe("the monitored items", () => {
  it("reports node_mismatch, never connected, when the server refuses one item", async () => {
    const second: FixtureChannel = {
      tag: "press.valve.retract",
      direction: "command",
      identifier: `${PREFIX}plc_retract`,
    };
    const harness = await mismatch({
      pki,
      server: {
        variables: [
          { name: "plc_extend", dataType: "Boolean" },
          { name: "plc_retract", dataType: "Boolean" },
          { name: "plc_out", dataType: "Boolean" },
        ],
        maxMonitoredItemsPerSubscription: 1,
      },
      module: { ...NONE, channels: [command, second, feedback] },
    });

    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "node_mismatch" }]);
    const lines = errors(harness.logLines);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("refused to monitor");
    expect(lines[0]).toContain("plc_retract");
    expect(lines[0]).toContain("press.valve.retract");
  });
});

describe("the namespace check", () => {
  it("lists the server's NamespaceArray when the namespace URI is unknown", async () => {
    const harness = await mismatch({
      pki,
      server: {},
      module: { ...NONE, namespaceUri: "urn:not:there" },
    });

    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "node_mismatch" }]);
    const lines = errors(harness.logLines);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('no namespace "urn:not:there"');
    expect(lines[0]).toContain("[0] http://opcfoundation.org/UA/");
    expect(lines[0]).toContain("urn:test:plc");
  });
});

describe("what happens after a session ended", () => {
  it("tries again after the node_mismatch delay, with a new log line each time", async () => {
    const harness = await startHarness({
      pki,
      server: { variables: [{ name: "plc_extend", dataType: "Boolean" }] },
      module: { ...NONE, channels: [command, feedback] },
      session: { retry: { ...DEFAULT_RETRY_TIMINGS, fixedMilliseconds: 30 } },
    });

    harness.sessions.start();
    await harness.logged(() => errors(harness.logLines).length >= 3);

    expect(harness.bus.statuses).toEqual([{ connected: false, reason: "node_mismatch" }]);
  });
});
