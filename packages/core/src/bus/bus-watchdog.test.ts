import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IoMappingRow } from "../domain/io-mapping.ts";
import {
  type BusAxis,
  COIL_EXTEND,
  COIL_RETRACT,
  POSITION,
  SETPOINT,
  startBusAxis,
} from "../test-support/bus-axis.ts";
import type { BusClient } from "../test-support/bus-client.ts";
import { consoleEntries, openRole, tagNamed } from "../test-support/bus-rest.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";

// The watchdog on the core's side (ADR 0045 point 11).

const row = (
  tag: string,
  module: string,
  type: IoMappingRow["type"],
  direction: IoMappingRow["direction"],
): IoMappingRow => ({ tag, module, type, direction });

const ROWS = [
  row(COIL_EXTEND, "m1", "bit", "command"),
  row(COIL_RETRACT, "m2", "bit", "command"),
  row(SETPOINT, "m1", "float", "command"),
  row(POSITION, "m1", "float", "feedback"),
  // A mapped tag that the Pantin no longer has is skipped.
  row("carriage.ghost.coil_1", "m1", "bit", "command"),
];

let axis: BusAxis;
let plc: BusClient;
const opened: BusClient[] = [];

async function start(rows: readonly IoMappingRow[] = ROWS): Promise<void> {
  axis = await startBusAxis({ ioMappingSource: fakeMappingSource(rows) });
  plc = await openRole(axis, "plc", opened);
}

afterEach(async () => {
  for (const connection of opened.splice(0)) {
    connection.socket.terminate();
  }
  await axis.close();
});

async function plcWrite(tag: string, value: number): Promise<void> {
  plc.send({ type: "write", id: `w-${tag}`, tag, value });
  await plc.next("ack");
}

async function loudEntries(code: string) {
  return (await consoleEntries(axis)).filter((entry) => entry.code === code);
}

async function valueOfTag(tag: string): Promise<number | undefined> {
  return (await tagNamed(axis, tag))?.value;
}

describe("plc_status", () => {
  beforeEach(async () => {
    await start();
    await plcWrite(COIL_EXTEND, 1);
    await plcWrite(COIL_RETRACT, 1);
    await plcWrite(SETPOINT, 0.05);
  });

  it("resets the bit commands mapped on the lost module to 0, and only those", async () => {
    plc.send({ type: "plc_status", module: "m1", connected: false, reason: "closed" });
    await plc.barrier();
    expect(await valueOfTag(COIL_EXTEND)).toBe(0);
    expect(await valueOfTag(COIL_RETRACT)).toBe(1);
    // Float commands keep their value: a setpoint of 0 would drive the axis.
    expect(await valueOfTag(SETPOINT)).toBe(0.05);
  });

  it("logs plc_disconnected as a warning with the module and the reason, and plc_connected as info", async () => {
    plc.send({ type: "plc_status", module: "m1", connected: false, reason: "timeout" });
    plc.send({ type: "plc_status", module: "m1", connected: true, reason: null });
    await plc.barrier();
    expect(await loudEntries("plc_disconnected")).toMatchObject([
      { level: "warning", params: { module: "m1", reason: "timeout" } },
    ]);
    expect(await loudEntries("plc_connected")).toMatchObject([
      { level: "info", params: { module: "m1" } },
    ]);
  });

  it("does not log forced_tag_written for its own writes", async () => {
    plc.send({ type: "plc_status", module: "m1", connected: false, reason: "closed" });
    await plc.barrier();
    expect(await loudEntries("forced_tag_written")).toEqual([]);
  });

  it("lets a forced tag keep its forced value, whose PLC last value becomes 0", async () => {
    const client = await openRole(axis, "client", opened);
    client.send({ type: "write", id: "c1", tag: COIL_EXTEND, value: 1 });
    await client.next("ack");
    plc.send({ type: "plc_status", module: "m1", connected: false, reason: "closed" });
    await plc.barrier();
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 1, forced: true });
    client.send({ type: "release", id: "c2", tag: COIL_EXTEND });
    await client.next("ack");
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
  });

  it("does nothing to the tags of a module nothing is mapped on", async () => {
    plc.send({ type: "plc_status", module: "m9", connected: false, reason: "closed" });
    await plc.barrier();
    expect(await valueOfTag(COIL_EXTEND)).toBe(1);
    expect(await valueOfTag(COIL_RETRACT)).toBe(1);
    expect(await loudEntries("plc_disconnected")).toHaveLength(1);
  });
});

describe("the bridge connecting and leaving", () => {
  it("logs bridge_connected as info when the plc says hello", async () => {
    await start();
    expect(await loudEntries("bridge_connected")).toMatchObject([
      { level: "info", source: { kind: "pantin" } },
    ]);
  });
});

describe("the bridge connection closing", () => {
  it("resets the bit commands of every mapped module when the connection closes", async () => {
    await start();
    await plcWrite(COIL_EXTEND, 1);
    await plcWrite(COIL_RETRACT, 1);
    await plcWrite(SETPOINT, 0.05);
    plc.socket.close();
    await plc.closed;
    await expect.poll(() => loudEntries("bridge_disconnected")).toHaveLength(1);
    expect(await valueOfTag(COIL_EXTEND)).toBe(0);
    expect(await valueOfTag(COIL_RETRACT)).toBe(0);
    expect(await valueOfTag(SETPOINT)).toBe(0.05);
    expect(await loudEntries("bridge_disconnected")).toMatchObject([
      { level: "warning", params: { reason: "closed" } },
    ]);
    expect(await loudEntries("plc_disconnected")).toEqual([]);
  });

  it("does the same, with reason timeout, when the bridge misses its pongs", async () => {
    axis = await startBusAxis({ ioMappingSource: fakeMappingSource(ROWS) });
    plc = await openRole(axis, "plc", opened, { autoPong: false });
    await plcWrite(COIL_EXTEND, 1);
    for (let second = 0; second < 3; second += 1) {
      axis.busClock.advance(1);
    }
    await plc.closed;
    await expect.poll(() => loudEntries("bridge_disconnected")).toHaveLength(1);
    expect(await valueOfTag(COIL_EXTEND)).toBe(0);
    expect(await loudEntries("bridge_disconnected")).toMatchObject([
      { params: { reason: "timeout" } },
    ]);
  });
});

describe("the bridge leaving, in detail", () => {
  it("changes nothing when no tag is mapped, and still logs the loss", async () => {
    await start([]);
    await plcWrite(COIL_EXTEND, 1);
    plc.socket.close();
    await plc.closed;
    await expect.poll(() => loudEntries("bridge_disconnected")).toHaveLength(1);
    expect(await valueOfTag(COIL_EXTEND)).toBe(1);
  });

  it("leaves a forced tag at its forced value when the connection closes", async () => {
    await start();
    const client = await openRole(axis, "client", opened);
    client.send({ type: "write", id: "c1", tag: COIL_RETRACT, value: 1 });
    await client.next("ack");
    plc.socket.close();
    await plc.closed;
    await expect.poll(() => loudEntries("bridge_disconnected")).toHaveLength(1);
    expect(await tagNamed(axis, COIL_RETRACT)).toMatchObject({ value: 1, forced: true });
  });

  it("does not run the watchdog when the core itself closes", async () => {
    await start();
    await plcWrite(COIL_EXTEND, 1);
    // afterEach closes the core while the plc is still connected; the test
    // server turns any unexpected error from the late close into a failure.
    expect(opened).toContain(plc);
  });
});
