import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { type BusAxis, COIL_EXTEND, startBusAxis } from "../test-support/bus-axis.ts";
import type { BusClient } from "../test-support/bus-client.ts";
import { consoleEntries, openRole, putTag } from "../test-support/bus-rest.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// The clock with a bridge (ADR 0045 point 12), and the console, clock and
// io_changed messages of the tag bus (point 4).

let axis: BusAxis;
const opened: BusClient[] = [];

beforeEach(async () => {
  axis = await startBusAxis({ ioMappingSource: fakeMappingSource([]) });
});

afterEach(async () => {
  for (const connection of opened.splice(0)) {
    connection.socket.terminate();
  }
  await axis.close();
});

const setRunning = (running: boolean) =>
  sendJsonRequest(axis.server, "PUT", "/api/pantins/axis/clock", { running });

async function pauseCodes(): Promise<string[]> {
  return (await consoleEntries(axis))
    .filter((entry) => entry.code.startsWith("clock_"))
    .map((entry) => entry.code);
}

// Console messages up to the next one with this code: the bridge's own entries come first.
async function nextConsole(client: BusClient, code: string) {
  for (;;) {
    const message = await client.next("console");
    if (message.entry.code === code) {
      return message;
    }
  }
}

describe("pause with a bridge", () => {
  it("writes clock_paused without a bridge, and clock_resumed on resume", async () => {
    await setRunning(false);
    await setRunning(true);
    expect(await pauseCodes()).toEqual(["clock_paused", "clock_resumed"]);
  });

  it("writes clock_paused_with_bridge as a warning instead of clock_paused", async () => {
    await openRole(axis, "plc", opened);
    await setRunning(false);
    await setRunning(true);
    const entries = (await consoleEntries(axis)).filter((entry) => entry.code.startsWith("clock_"));
    expect(entries.map((entry) => entry.code)).toEqual([
      "clock_paused_with_bridge",
      "clock_resumed",
    ]);
    expect(entries[0]?.level).toBe("warning");
  });

  it("writes it when a bridge connects to a paused Pantin", async () => {
    await setRunning(false);
    await openRole(axis, "plc", opened);
    expect(await pauseCodes()).toEqual(["clock_paused", "clock_paused_with_bridge"]);
  });

  it("writes nothing for a step request, and a client connection is not a bridge", async () => {
    await openRole(axis, "client", opened);
    await setRunning(false);
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/clock/step", { steps: 3 });
    expect(await pauseCodes()).toEqual(["clock_paused"]);
  });

  it("goes back to clock_paused once the bridge is gone", async () => {
    const plc = await openRole(axis, "plc", opened);
    plc.socket.close();
    await plc.closed;
    await expect
      .poll(async () => (await consoleEntries(axis)).some((e) => e.code === "bridge_disconnected"))
      .toBe(true);
    await setRunning(false);
    expect(await pauseCodes()).toEqual(["clock_paused"]);
  });
});

describe("console messages", () => {
  it("sends each new entry, and a folded one again with its count", async () => {
    const client = await openRole(axis, "client", opened);
    await setRunning(false);
    axis.runSeconds(STEP_SECONDS);
    const paused = await client.next("console");
    expect(paused.entry).toMatchObject({ code: "clock_paused", count: 1 });
    await setRunning(true);
    await setRunning(false);
    axis.runSeconds(STEP_SECONDS);
    const messages = [await client.next("console"), await client.next("console")];
    expect(messages.map((message) => message.entry.code)).toEqual([
      "clock_resumed",
      "clock_paused",
    ]);
  });

  it("sends a folded entry again with a new sequence and a grown count", async () => {
    const client = await openRole(axis, "client", opened);
    const plc = await openRole(axis, "plc", opened);
    await putTag(axis, COIL_EXTEND, 1);
    for (const id of ["p1", "p2"]) {
      plc.send({ type: "write", id, tag: COIL_EXTEND, value: 0 });
      await plc.next("ack");
      axis.runSeconds(STEP_SECONDS);
    }
    const first = await nextConsole(client, "forced_tag_written");
    const second = await nextConsole(client, "forced_tag_written");
    expect(first.entry).toMatchObject({ code: "forced_tag_written", count: 1 });
    expect(second.entry).toMatchObject({ code: "forced_tag_written", count: 2 });
    expect(second.entry.sequence).toBeGreaterThan(first.entry.sequence);
    expect(second.entry.firstSequence).toBe(first.entry.firstSequence);
  });

  it("does not replay the console history to a new connection", async () => {
    await setRunning(false);
    const client = await openRole(axis, "client", opened);
    axis.runSeconds(STEP_SECONDS);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "console")).toEqual([]);
  });
});

describe("clock messages", () => {
  it("sends the clock once a second while running, on the bus clock", async () => {
    const client = await openRole(axis, "client", opened);
    axis.runSeconds(STEP_SECONDS);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "clock")).toEqual([]);
    axis.busClock.advance(1);
    axis.runSeconds(STEP_SECONDS);
    const message = await client.next("clock");
    expect(message.clock).toMatchObject({ running: true });
    expect(message.clock.step).toBe(2);
  });

  it("sends it at once when the clock is paused, resumed or stepped", async () => {
    const client = await openRole(axis, "client", opened);
    await setRunning(false);
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("clock")).clock.running).toBe(false);
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/clock/step", { steps: 5 });
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("clock")).clock).toMatchObject({ running: false, step: 5 });
    await setRunning(true);
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("clock")).clock.running).toBe(true);
  });

  it("sends nothing while paused and idle", async () => {
    const client = await openRole(axis, "client", opened);
    await setRunning(false);
    axis.runSeconds(STEP_SECONDS);
    await client.next("clock");
    axis.busClock.advance(1);
    axis.runSeconds(STEP_SECONDS);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "clock")).toEqual([]);
  });
});

describe("io_changed", () => {
  const keyRequest = { tagKey: "stroke-2" };

  it("is sent when a joint is renamed in its tags, created or deleted", async () => {
    const client = await openRole(axis, "client", opened);
    const rekey = await sendJsonRequest(
      axis.server,
      "PUT",
      "/api/pantins/axis/joints/stroke/tag-key",
      keyRequest,
    );
    expect(rekey.status).toBe(200);
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("io_changed")).type).toBe("io_changed");

    const deleted = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(deleted.status).toBe(200);
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("io_changed")).type).toBe("io_changed");

    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/joints", {
      type: "prismatic",
      name: "Stroke",
      parent: bodyEndpoint("rail"),
      child: groupEndpoint("carriage"),
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    });
    axis.runSeconds(STEP_SECONDS);
    expect((await client.next("io_changed")).type).toBe("io_changed");
  });

  it("is not sent for an edit that leaves the tag list as it was", async () => {
    const client = await openRole(axis, "client", opened);
    await sendJsonRequest(axis.server, "PATCH", "/api/pantins/axis", { name: "Renamed" });
    axis.runSeconds(STEP_SECONDS);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "io_changed")).toEqual([]);
  });
});
