import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import {
  type BusAxis,
  COIL_EXTEND,
  COIL_RETRACT,
  POSITION,
  SETPOINT,
  startBusAxis,
} from "../test-support/bus-axis.ts";
import type { BusClient } from "../test-support/bus-client.ts";
import {
  consoleEntries,
  openRole,
  postRuntime,
  putTag,
  tagNamed,
} from "../test-support/bus-rest.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";

// Write sources, forced tags and releases (ADR 0045 point 5, ADR 0031 point 6).

let axis: BusAxis;
let client: BusClient;
let plc: BusClient;
const opened: BusClient[] = [];

beforeEach(async () => {
  axis = await startBusAxis({ ioMappingSource: fakeMappingSource([]) });
  client = await openRole(axis, "client", opened);
  plc = await openRole(axis, "plc", opened);
});

afterEach(async () => {
  for (const connection of opened.splice(0)) {
    connection.socket.terminate();
  }
  await axis.close();
});

async function write(from: BusClient, id: string, tag: string, value: number) {
  from.send({ type: "write", id, tag, value });
  return await from.next("ack");
}

// The console also holds the bridge's own entries (bridge_connected).
async function forcedTagEntries() {
  return (await consoleEntries(axis)).filter((entry) => entry.code === "forced_tag_written");
}

describe("a client write", () => {
  it("is acknowledged, applies, and forces the tag", async () => {
    const ack = await write(client, "w1", COIL_EXTEND, 1);
    expect(ack).toEqual({
      type: "ack",
      id: "w1",
      tag: { name: COIL_EXTEND, value: 1, forced: true },
      ignored: null,
    });
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 1, forced: true });
  });

  it("forces the tag as a REST write does", async () => {
    expect((await putTag(axis, COIL_EXTEND, 1)).status).toBe(200);
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 1, forced: true });
  });
});

describe("a PLC write", () => {
  it("applies on a tag that is not forced, without forcing it", async () => {
    const ack = await write(plc, "p1", COIL_EXTEND, 1);
    expect(ack.tag).toEqual({ name: COIL_EXTEND, value: 1, forced: false });
    expect(ack.ignored).toBeNull();
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 1, forced: false });
    // A later PLC write still applies.
    expect((await write(plc, "p2", COIL_EXTEND, 0)).tag).toMatchObject({ value: 0 });
  });

  it("is ignored on a forced tag: acknowledged as ignored, and logged as forced_tag_written", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    const ack = await write(plc, "p1", COIL_EXTEND, 0);
    expect(ack.ignored).toBe("forced");
    expect(ack.tag).toEqual({ name: COIL_EXTEND, value: 1, forced: true });
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 1, forced: true });
    expect(await forcedTagEntries()).toMatchObject([
      {
        code: "forced_tag_written",
        level: "error",
        count: 1,
        params: { tag: COIL_EXTEND, forcedValue: 1, writtenValue: 0 },
      },
    ]);
  });

  it("folds repeated ignored writes into one console entry", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    await write(plc, "p1", COIL_EXTEND, 0);
    await write(plc, "p2", COIL_EXTEND, 0);
    const entries = await forcedTagEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ code: "forced_tag_written", count: 2 });
  });

  it("is ignored on a forced float setpoint as well", async () => {
    await write(client, "w1", SETPOINT, 0.05);
    expect((await write(plc, "p1", SETPOINT, 0.01)).ignored).toBe("forced");
    expect(await tagNamed(axis, SETPOINT)).toMatchObject({ value: 0.05, forced: true });
  });
});

describe("release", () => {
  it("re-applies the PLC's last value, which was ignored while the tag was forced", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    await write(plc, "p1", COIL_EXTEND, 0);
    client.send({ type: "release", id: "r1", tag: COIL_EXTEND });
    expect(await client.next("ack")).toEqual({
      type: "ack",
      id: "r1",
      tag: { name: COIL_EXTEND, value: 0, forced: false },
      ignored: null,
    });
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
  });

  it("keeps the forced value when the PLC never wrote the tag", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    client.send({ type: "release", id: "r1", tag: COIL_EXTEND });
    expect((await client.next("ack")).tag).toEqual({
      name: COIL_EXTEND,
      value: 1,
      forced: false,
    });
  });

  it("lets the PLC write the tag again once it is released", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    client.send({ type: "release", id: "r1", tag: COIL_EXTEND });
    await client.next("ack");
    expect((await write(plc, "p1", COIL_EXTEND, 0)).ignored).toBeNull();
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
  });

  it("releases every forced tag with all: true, each taking its PLC value", async () => {
    await write(client, "w1", COIL_EXTEND, 1);
    await write(client, "w2", COIL_RETRACT, 1);
    await write(client, "w3", SETPOINT, 0.05);
    await write(plc, "p1", COIL_EXTEND, 0);
    client.send({ type: "release", id: "r1", all: true });
    expect(await client.next("ack")).toEqual({ type: "ack", id: "r1", tag: null, ignored: null });
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
    expect(await tagNamed(axis, COIL_RETRACT)).toMatchObject({ value: 1, forced: false });
    expect(await tagNamed(axis, SETPOINT)).toMatchObject({ value: 0.05, forced: false });
  });

  it("answers an unknown or feedback tag with an error and keeps the connection", async () => {
    client.send({ type: "release", id: "r1", tag: "carriage.valve.nothing" });
    expect(await client.next("error")).toMatchObject({ id: "r1", code: "not_found" });
    client.send({ type: "release", id: "r2", tag: POSITION });
    expect(await client.next("error")).toMatchObject({ id: "r2", code: "invalid_request" });
  });
});

describe("reset and discard", () => {
  async function forceAndLetPlcWrite(): Promise<void> {
    await write(client, "w1", COIL_EXTEND, 1);
    await write(plc, "p1", COIL_EXTEND, 0);
    client.send({ type: "subscribe", tags: [COIL_EXTEND] });
    await client.next("snapshot");
  }

  it.each(["reset", "discard"] as const)(
    "%s clears the forces and the PLC's values, and sends a snapshot",
    async (action) => {
      await forceAndLetPlcWrite();
      // A discard reloads the saved document: save the one the tests built.
      await postRuntime(axis, "save");
      await postRuntime(axis, action);
      axis.runSeconds(STEP_SECONDS);
      expect((await client.next("snapshot")).tags).toEqual([
        { name: COIL_EXTEND, value: 0, forced: false },
      ]);
      expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
      // The PLC's last value is gone too: a release finds nothing to re-apply.
      await write(client, "w2", COIL_EXTEND, 1);
      client.send({ type: "release", id: "r1", tag: COIL_EXTEND });
      expect((await client.next("ack")).tag).toMatchObject({ value: 1, forced: false });
    },
  );

  it("sends no snapshot to a connection that did not subscribe", async () => {
    await postRuntime(axis, "reset");
    axis.runSeconds(STEP_SECONDS);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "snapshot")).toEqual([]);
  });
});

describe("value checks on the bus", () => {
  it.each([2, -1, 0.5])(
    "refuses %s on a bit with invalid_request, and changes nothing",
    async (value) => {
      client.send({ type: "write", id: "w1", tag: COIL_EXTEND, value });
      const error = await client.next("error");
      expect(error).toMatchObject({ id: "w1", code: "invalid_request" });
      expect(error.message).toContain("bit");
      expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
    },
  );

  it("applies the same check to a PLC write", async () => {
    plc.send({ type: "write", id: "p1", tag: COIL_EXTEND, value: 2 });
    expect(await plc.next("error")).toMatchObject({ id: "p1", code: "invalid_request" });
  });

  it("refuses a feedback tag and an unknown tag, and keeps the connection", async () => {
    client.send({ type: "write", id: "w1", tag: POSITION, value: 0.01 });
    expect(await client.next("error")).toMatchObject({ id: "w1", code: "invalid_request" });
    client.send({ type: "write", id: "w2", tag: "carriage.valve.nothing", value: 1 });
    expect(await client.next("error")).toMatchObject({ id: "w2", code: "not_found" });
    expect((await write(client, "w3", COIL_EXTEND, 1)).ignored).toBeNull();
  });

  it("accepts a float setpoint that is not a whole number", async () => {
    expect((await write(client, "w1", SETPOINT, 0.0123)).tag?.value).toBe(0.0123);
  });
});
