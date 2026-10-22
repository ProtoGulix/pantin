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

const TYPES = [
  ["INT", "Int16"],
  ["DINT", "Int32"],
  ["LINT", "Int64"],
  ["REAL", "Float"],
  ["LREAL", "Double"],
] as const;

const feedbackChannels: FixtureChannel[] = TYPES.map(([iecType]) => ({
  tag: `press.value.${iecType.toLowerCase()}`,
  direction: "feedback",
  identifier: `${PREFIX}out_${iecType}`,
  iecType,
}));
const commandChannels: FixtureChannel[] = TYPES.map(([iecType]) => ({
  tag: `press.setpoint.${iecType.toLowerCase()}`,
  direction: "command",
  identifier: `${PREFIX}in_${iecType}`,
  iecType,
}));
const variables = TYPES.flatMap(([iecType, dataType]) => [
  { name: `out_${iecType}`, dataType },
  { name: `in_${iecType}`, dataType },
]);

async function connected(extra: Partial<Parameters<typeof startHarness>[0]["server"]> = {}) {
  const harness = await startHarness({
    pki,
    server: { variables, ...extra },
    module: { ...NONE, channels: [...feedbackChannels, ...commandChannels] },
  });
  harness.sessions.start();
  await harness.status((status) => status.connected);
  return harness;
}

describe("values of each IEC type", () => {
  it("writes integers wrapped to their width, and floats as they are", async () => {
    const harness = await connected();

    harness.feedback("tags", [
      ["press.value.int", 32768],
      ["press.value.dint", 2 ** 31 + 5],
      ["press.value.lint", 2 ** 62],
      ["press.value.real", 1.5],
      ["press.value.lreal", 0.1],
    ]);
    await harness.server.until("out_LREAL", (value) => value === 0.1);
    await harness.server.until("out_LINT", (value) => value === 2 ** 62);

    expect(harness.server.current("out_INT")).toBe(-32768);
    expect(harness.server.current("out_DINT")).toBe(-(2 ** 31) + 5);
    expect(harness.server.current("out_REAL")).toBe(1.5);
  });

  it("carries a negative Int64, and wraps one past 2^63", async () => {
    const harness = await connected();

    harness.feedback("tags", [["press.value.lint", -7]]);
    await harness.server.until("out_LINT", (value) => value === -7);
    harness.feedback("tags", [["press.value.lint", 2 ** 63]]);

    await harness.server.until("out_LINT", (value) => value === -(2 ** 63));
  });

  it("reads commands of each type, an Int64 beyond 32 bits and a negative one included", async () => {
    const harness = await connected();
    await harness.write((write) => write.tag === "press.setpoint.lint");

    const arrived = harness.nextWrite(
      (write) => write.tag === "press.setpoint.lint" && write.value === -(2 ** 40),
    );
    harness.server.set("in_LINT", -(2 ** 40));
    await arrived;
    harness.server.set("in_INT", -123);
    harness.server.set("in_REAL", 2.5);
    await harness.write((write) => write.tag === "press.setpoint.real" && write.value === 2.5);
    await harness.write((write) => write.tag === "press.setpoint.int" && write.value === -123);
  });
});

describe("the operation limits", () => {
  it("splits one write by the server's MaxNodesPerWrite", async () => {
    const harness = await connected({ maxNodesPerWrite: 2 });

    harness.feedback(
      "snapshot",
      feedbackChannels.map((channel, index): [string, number] => [channel.tag, index + 1]),
    );
    await harness.server.until("out_LREAL", (value) => value === 5);

    expect(harness.server.current("out_INT")).toBe(1);
    expect(harness.logLines.filter((line) => line.includes("write"))).toEqual([]);
  });
});
