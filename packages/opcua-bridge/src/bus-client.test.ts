import { TAG_BUS_CLOSE_CODES, TagBusClientMessageSchema } from "@pantin/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type BusClient, openBus } from "./bus-client.ts";
import { BusClosedError, CoreUnavailableError, ProtocolError } from "./errors.ts";
import { FAKE_PANTIN_ID, type FakeCore, startFakeCore } from "./test-support/fake-core.ts";
import { FIXTURE_MAPPING_ID, opcuaProjection } from "./test-support/projection-fixtures.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function connect(options: Partial<Parameters<typeof startFakeCore>[0]> = {}) {
  const core = await startFakeCore({ projection: opcuaProjection(), ...options });
  cleanups.push(() => core.close());
  return {
    core,
    url: `ws://${core.url.slice("http://".length)}/api/pantins/${FAKE_PANTIN_ID}/bus`,
  };
}

async function open(bus: string): Promise<BusClient> {
  const client = await openBus(bus, FIXTURE_MAPPING_ID);
  cleanups.push(() => client.close());
  return client;
}

async function next(core: FakeCore, type: string): Promise<unknown> {
  return core.nextMessage(type);
}

describe("openBus", () => {
  it("says hello as the opcua_client plc, with the projection's id, and reads the welcome", async () => {
    const { core, url } = await connect();

    const client = await open(url);

    expect(client.welcome).toMatchObject({ type: "welcome", version: 2 });
    expect(await next(core, "hello")).toEqual({
      type: "hello",
      version: 2,
      role: "plc",
      transport: "opcua_client",
      mappingId: FIXTURE_MAPPING_ID,
    });
  });

  it("sends subscribe, write and plc_status frames the protocol accepts", async () => {
    const { core, url } = await connect();
    const client = await open(url);

    client.subscribe(["press.cylinder.extended"]);
    client.write("press.valve.extend", 1);
    client.write("press.valve.extend", 0);
    client.plcStatus("plc", { connected: true });
    client.plcStatus("plc", { connected: false, reason: "node_mismatch" });
    await client.close();

    const sent = core.received.slice(1);
    expect(sent.map((message) => TagBusClientMessageSchema.parse(message))).toEqual([
      { type: "subscribe", tags: ["press.cylinder.extended"] },
      { type: "write", id: "b1", tag: "press.valve.extend", value: 1 },
      { type: "write", id: "b2", tag: "press.valve.extend", value: 0 },
      { type: "plc_status", module: "plc", connected: true, reason: null },
      { type: "plc_status", module: "plc", connected: false, reason: "node_mismatch" },
    ]);
  });

  it("hands validated messages to the listener and skips console entries", async () => {
    const { core, url } = await connect();
    const client = await open(url);
    const received: string[] = [];
    client.onMessage((message) => received.push(message.type));

    core.send({ type: "console", entry: { unknown: "shape from a newer core" } });
    core.send({ type: "io_changed" });
    core.send({ type: "snapshot", step: 1, tags: [] });
    await core.nextMessage("hello");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toEqual(["io_changed", "snapshot"]);
  });

  it.each([
    ["a frame that is not JSON", "not json", false],
    ["a binary frame", Buffer.from("{}"), true],
    [
      "a message the protocol refuses",
      JSON.stringify({ type: "snapshot", step: -1, tags: [] }),
      false,
    ],
  ])("ends with a protocol error on %s", async (_name, frame, binary) => {
    const { core, url } = await connect();
    const client = await open(url);

    core.sendRaw(frame, binary);

    expect(await client.ended).toBeInstanceOf(ProtocolError);
  });

  it("ends with a bus_closed error when the core closes the bus", async () => {
    const { core, url } = await connect();
    const client = await open(url);

    core.closeBus(TAG_BUS_CLOSE_CODES.mappingMismatch, "the mapping changed");

    const error = await client.ended;
    expect(error).toBeInstanceOf(BusClosedError);
    expect(error.message).toMatch(
      /4003.*io mapping changed.*the mapping changed.*Restart the bridge/,
    );
  });

  it("reports the close code when the core refuses the hello", async () => {
    const { url } = await connect({
      refuseHelloWith: { code: TAG_BUS_CLOSE_CODES.plcAlreadyConnected, reason: "slot taken" },
    });

    await expect(open(url)).rejects.toThrow(/4002.*another bridge of this transport.*slot taken/);
  });

  it("refuses an answer to the hello that is not a welcome", async () => {
    const { url } = await connect({ answerHelloWith: { type: "io_changed" } });

    await expect(open(url)).rejects.toThrow(ProtocolError);
  });

  it("reports a bus that cannot be reached", async () => {
    await expect(openBus("ws://127.0.0.1:1/api/pantins/x/bus", "id")).rejects.toThrow(
      CoreUnavailableError,
    );
  });
});
