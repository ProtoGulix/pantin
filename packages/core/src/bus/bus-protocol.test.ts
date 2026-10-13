import { TAG_BUS_CLOSE_CODES, TAG_BUS_MAX_MESSAGE_BYTES } from "@pantin/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";
import { fakeMappingSource, PLC_MAPPING_ID } from "../test-support/fake-io-mapping.ts";

// Close codes, roles and liveness of the tag bus (ADR 0045 point 4).

const CLOSE = TAG_BUS_CLOSE_CODES;
const HELLO_CLIENT = { type: "hello", version: 1, role: "client" } as const;
const HELLO_PLC = { type: "hello", version: 1, role: "plc", mappingId: PLC_MAPPING_ID } as const;

let axis: BusAxis;
const clients: BusClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }
  await axis.close();
});

async function connect(options: Parameters<typeof connectBus>[1] = {}): Promise<BusClient> {
  const client = await connectBus(axis.server, options);
  clients.push(client);
  return client;
}

async function startAxis(mapped = true) {
  axis = await startBusAxis(mapped ? { ioMappingSource: fakeMappingSource([]) } : {});
}

describe("hello", () => {
  it("answers welcome with the version, the console id and the clock", async () => {
    await startAxis();
    const client = await connect();
    client.send(HELLO_CLIENT);
    const welcome = await client.next("welcome");
    expect(welcome.version).toBe(1);
    expect(welcome.consoleId.length).toBeGreaterThan(0);
    expect(welcome.clock).toMatchObject({ running: true, step: 0, droppedSteps: 0 });
  });
});

describe("close 4000: invalid message", () => {
  const BAD_FRAMES: [string, string | Buffer][] = [
    ["text that is not JSON", "{nope"],
    ["JSON that is not a message", '{"type":"ping"}'],
    ["a message missing a field", '{"type":"hello","role":"client"}'],
    ["a binary frame", Buffer.from(JSON.stringify(HELLO_CLIENT))],
  ];

  it.each(BAD_FRAMES)("closes on %s", async (_name, frame) => {
    await startAxis();
    const client = await connect();
    client.socket.send(frame);
    expect((await client.closed).code).toBe(CLOSE.invalidMessage);
  });

  it("closes when the first message is not hello", async () => {
    await startAxis();
    const client = await connect();
    client.send({ type: "subscribe", tags: "*" });
    expect((await client.closed).code).toBe(CLOSE.invalidMessage);
  });

  it("closes on a second hello", async () => {
    await startAxis();
    const client = await connect();
    client.send(HELLO_CLIENT);
    await client.next("welcome");
    client.send(HELLO_CLIENT);
    expect((await client.closed).code).toBe(CLOSE.invalidMessage);
  });

  it("closes a client that sends plc_status, and a plc that releases", async () => {
    await startAxis();
    const client = await connect();
    client.send(HELLO_CLIENT);
    await client.next("welcome");
    client.send({ type: "plc_status", module: "m1", connected: true, reason: null });
    expect((await client.closed).code).toBe(CLOSE.invalidMessage);

    const plc = await connect();
    plc.send(HELLO_PLC);
    await plc.next("welcome");
    plc.send({ type: "release", id: "r1", all: true });
    expect((await plc.closed).code).toBe(CLOSE.invalidMessage);
  });

  it("closes with 1009, the protocol's own code, on a message over 64 KiB", async () => {
    await startAxis();
    const client = await connect();
    client.socket.send(" ".repeat(TAG_BUS_MAX_MESSAGE_BYTES + 1));
    expect((await client.closed).code).toBe(1009);
  });
});

describe("close 4001: unsupported version", () => {
  it("closes on a version the core does not speak", async () => {
    await startAxis();
    const client = await connect();
    client.send({ type: "hello", version: 2, role: "client" });
    expect((await client.closed).code).toBe(CLOSE.unsupportedVersion);
  });
});

describe("close 4002: a second plc", () => {
  it("allows one plc per Pantin, and a new one once the first is gone", async () => {
    await startAxis();
    const first = await connect();
    first.send(HELLO_PLC);
    await first.next("welcome");
    const second = await connect();
    second.send(HELLO_PLC);
    expect((await second.closed).code).toBe(CLOSE.plcAlreadyConnected);

    first.socket.close();
    await first.closed;
    // The slot is freed when the core sees the close; a hello sent too early is refused.
    await expect
      .poll(async () => {
        const third = await connect();
        third.send(HELLO_PLC);
        return await Promise.race([
          third.next("welcome").then(() => "welcome"),
          third.closed.then(({ code }) => String(code)),
        ]);
      })
      .toBe("welcome");
  });

  it("lets a client connect beside the plc", async () => {
    await startAxis();
    const plc = await connect();
    plc.send(HELLO_PLC);
    await plc.next("welcome");
    const client = await connect();
    client.send(HELLO_CLIENT);
    expect((await client.next("welcome")).type).toBe("welcome");
  });
});

describe("close 4003: the mapping", () => {
  it("refuses a plc when the Pantin has no valid io mapping (no io.json in its folder)", async () => {
    await startAxis(false);
    const plc = await connect();
    plc.send(HELLO_PLC);
    expect((await plc.closed).code).toBe(CLOSE.mappingMismatch);
  });

  it("refuses a plc that started with another mapping id", async () => {
    await startAxis();
    const plc = await connect();
    plc.send({ ...HELLO_PLC, mappingId: "another" });
    expect((await plc.closed).code).toBe(CLOSE.mappingMismatch);
  });

  it("accepts a client with no mapping at all", async () => {
    await startAxis(false);
    const client = await connect();
    client.send(HELLO_CLIENT);
    expect((await client.next("welcome")).type).toBe("welcome");
  });
});

describe("close 4004: no hello in time", () => {
  it("closes after 5 seconds without a message, on the bus clock", async () => {
    await startAxis();
    const client = await connect();
    for (let second = 1; second < 5; second += 1) {
      axis.busClock.advance(1);
      // The client's pong must be read before the next second passes.
      await expect.poll(() => client.pingCount()).toBe(second);
      await client.pongBarrier();
    }
    // Nothing may be sent to look: any message would meet the deadline.
    expect(client.socket.readyState).toBe(client.socket.OPEN);
    axis.busClock.advance(1);
    expect((await client.closed).code).toBe(CLOSE.helloTimeout);
  });
});
