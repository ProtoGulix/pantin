import { beforeAll, describe, expect, it } from "vitest";
import type { FixtureChannel } from "../test-support/projection-fixtures.ts";
import { createTestPki, startHarness } from "../test-support/session-harness.ts";
import type { Pki } from "./pki.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await createTestPki();
}, 30_000);

const NONE = { securityMode: "None", securityPolicy: "None" } as const;
const PREFIX = "s=|var|App.GVL_Pantin.";

const channels: FixtureChannel[] = [
  { tag: "press.valve.extend", direction: "command", identifier: `${PREFIX}plc_extend` },
  { tag: "press.valve.retract", direction: "command", identifier: `${PREFIX}plc_retract` },
  { tag: "press.cylinder.extended", direction: "feedback", identifier: `${PREFIX}plc_out` },
];
const variables = [
  { name: "plc_extend", dataType: "Boolean" },
  { name: "plc_retract", dataType: "Boolean" },
  { name: "plc_out", dataType: "Boolean" },
] as const;

async function connected(options: { sampling?: number; extraNamespaces?: string[] } = {}) {
  const harness = await startHarness({
    pki,
    server: {
      variables,
      ...(options.extraNamespaces === undefined
        ? {}
        : { extraNamespaceUris: options.extraNamespaces }),
    },
    module: {
      ...NONE,
      channels,
      ...(options.sampling === undefined ? {} : { samplingMilliseconds: options.sampling }),
    },
  });
  return harness;
}

describe("a session on a None endpoint", () => {
  it("is connected once its nodes are checked and the first publish arrived", async () => {
    const harness = await connected({ extraNamespaces: ["urn:other:first", "urn:other:second"] });

    harness.sessions.start();
    await harness.status((status) => status.connected);

    expect(harness.bus.statuses).toEqual([{ connected: true, reason: null }]);
  });

  it("forwards each change of a command to the bus, in order, once", async () => {
    const harness = await connected();
    harness.sessions.start();
    await harness.status((status) => status.connected);
    // The PLC's initial value comes first: nothing is known about it yet.
    await harness.write((write) => write.tag === "press.valve.extend");

    for (const value of [1, 0, 1]) {
      const arrived = harness.nextWrite((write) => write.value === value);
      harness.server.set("plc_extend", value);
      await arrived;
    }
    harness.server.set("plc_extend", 1);

    const extend = harness.bus.writes.filter((write) => write.tag === "press.valve.extend");
    expect(extend.map((write) => write.value)).toEqual([0, 1, 0, 1]);
  });

  it("writes the feedback it was given before the session opened, then each change", async () => {
    const harness = await connected();
    harness.feedback("snapshot", [["press.cylinder.extended", 1]]);

    harness.sessions.start();
    await harness.server.until("plc_out", (value) => value === 1);
    harness.feedback("tags", [["press.cylinder.extended", 0]]);
    await harness.server.until("plc_out", (value) => value === 0);

    expect(harness.server.changes.filter((change) => change.name === "plc_out")).toEqual([
      { name: "plc_out", value: 1 },
      { name: "plc_out", value: 0 },
    ]);
  });

  it("writes everything again after a snapshot, even unchanged values", async () => {
    const harness = await connected();
    harness.feedback("snapshot", [["press.cylinder.extended", 1]]);
    harness.sessions.start();
    await harness.server.until("plc_out", (value) => value === 1);
    harness.server.set("plc_out", 0);

    harness.feedback("snapshot", [["press.cylinder.extended", 1]]);

    await harness.server.until("plc_out", (value) => value === 1);
  });
});

describe("a pulse on a command", () => {
  it("is delivered, high then low, when it lasts longer than the sampling interval", async () => {
    const harness = await connected({ sampling: 20 });
    harness.sessions.start();
    await harness.status((status) => status.connected);
    await harness.write((write) => write.tag === "press.valve.retract");

    for (const value of [1, 0]) {
      const arrived = harness.nextWrite((write) => write.value === value);
      harness.server.set("plc_retract", value);
      await arrived;
    }

    const retract = harness.bus.writes.filter((write) => write.tag === "press.valve.retract");
    expect(retract.map((write) => write.value)).toEqual([0, 1, 0]);
  });

  it("can be lost when it is shorter than the sampling interval the server samples at", async () => {
    // The server only looks at the node every 400 ms: a pulse made of two writes in the same
    // tick is over before the next look (ADR 0065 point 2, and the guide says so).
    const harness = await connected({ sampling: 400 });
    harness.sessions.start();
    await harness.status((status) => status.connected);
    await harness.write((write) => write.tag === "press.valve.retract");

    harness.server.set("plc_retract", 1);
    harness.server.set("plc_retract", 0);
    harness.server.set("plc_extend", 1);
    await harness.write((write) => write.tag === "press.valve.extend" && write.value === 1);

    const retract = harness.bus.writes.filter((write) => write.tag === "press.valve.retract");
    expect(retract.map((write) => write.value)).toEqual([0]);
  });
});
