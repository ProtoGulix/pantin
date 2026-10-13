import { rm } from "node:fs/promises";
import { join } from "node:path";
import { IoMappingResponseSchema, TAG_BUS_CLOSE_CODES, type Tag } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BusAxis,
  COIL_EXTEND,
  COIL_RETRACT,
  SETPOINT,
  startBusAxis,
} from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";
import { listTags, tagNamed } from "../test-support/bus-rest.ts";
import { csvText, MODULES_JSON, writeIoFiles } from "../test-support/io-files.ts";
import { sendRaw } from "../test-support/test-server.ts";

// The bus on the real mapping, read from io.csv and io-modules.json (ADR 0045
// points 7, 10 and 11), not on a fake one.

let axis: BusAxis;
let tags: Tag[];
const clients: BusClient[] = [];

// The valve coils on different modules, everything else on m1.
function specs() {
  return tags.map((tag) => ({ tag, module: tag.name === COIL_RETRACT ? "m2" : "m1" }));
}

beforeEach(async () => {
  axis = await startBusAxis();
  tags = await listTags(axis);
  await writeIoFiles(axis, { csv: csvText(specs()), modules: MODULES_JSON });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }
  await axis.close();
});

async function currentMappingId(): Promise<string> {
  const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/io");
  const id = IoMappingResponseSchema.parse(response.json).mappingId;
  if (id === null) {
    throw new Error("The mapping files should exist.");
  }
  return id;
}

async function helloPlc(mappingId: string): Promise<BusClient> {
  const plc = await connectBus(axis.server);
  clients.push(plc);
  plc.send({ type: "hello", version: 1, role: "plc", mappingId });
  return plc;
}

describe("plc hello on the real mapping", () => {
  it("is accepted with the id GET .../io answers", async () => {
    const plc = await helloPlc(await currentMappingId());
    expect((await plc.next("welcome")).type).toBe("welcome");
  });

  it("is refused with 4003 when the files changed since the bridge read them", async () => {
    const stale = await currentMappingId();
    await writeIoFiles(axis, { modules: MODULES_JSON.replace("1503", "1600") });
    const plc = await helloPlc(stale);
    expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.mappingMismatch);
  });

  it("is refused with 4003 once the mapping went invalid, even with the id it had", async () => {
    const id = await currentMappingId();
    await writeIoFiles(axis, {
      csv: csvText(specs()).replace(SETPOINT, "carriage.ghost.setpoint"),
    });
    const plc = await helloPlc(id);
    expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.mappingMismatch);
  });

  it("is refused with 4003 when the Pantin has no io.csv", async () => {
    const bare = await startBusAxis();
    try {
      const plc = await connectBus(bare.server);
      clients.push(plc);
      plc.send({ type: "hello", version: 1, role: "plc", mappingId: "anything" });
      expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.mappingMismatch);
    } finally {
      await bare.close();
    }
  });

  it("stays welcome to a client, which needs no mapping", async () => {
    const client = await connectBus(axis.server);
    clients.push(client);
    client.send({ type: "hello", version: 1, role: "client" });
    expect((await client.next("welcome")).type).toBe("welcome");
  });
});

describe("the watchdog on the real mapping", () => {
  it("resets the bit commands of the lost module, and only that module's", async () => {
    const plc = await helloPlc(await currentMappingId());
    await plc.next("welcome");
    for (const [id, tag, value] of [
      ["w1", COIL_EXTEND, 1],
      ["w2", COIL_RETRACT, 1],
      ["w3", SETPOINT, 0.05],
    ] as const) {
      plc.send({ type: "write", id, tag, value });
      await plc.next("ack");
    }
    plc.send({ type: "plc_status", module: "m2", connected: false, reason: "timeout" });
    await plc.barrier();
    expect((await tagNamed(axis, COIL_RETRACT))?.value).toBe(0);
    expect((await tagNamed(axis, COIL_EXTEND))?.value).toBe(1);
    expect((await tagNamed(axis, SETPOINT))?.value).toBe(0.05);
  });

  it("resets every mapped bit command when the bridge connection closes", async () => {
    const plc = await helloPlc(await currentMappingId());
    await plc.next("welcome");
    plc.send({ type: "write", id: "w1", tag: COIL_EXTEND, value: 1 });
    await plc.next("ack");
    plc.socket.close();
    await plc.closed;
    await expect.poll(async () => (await tagNamed(axis, COIL_EXTEND))?.value).toBe(0);
  });
});

describe("the watchdog uses the mapping held at hello", () => {
  it("still resets the coils when the files are gone by the time the bridge closes", async () => {
    const plc = await helloPlc(await currentMappingId());
    await plc.next("welcome");
    plc.send({ type: "write", id: "w1", tag: COIL_EXTEND, value: 1 });
    await plc.next("ack");
    const folder = join(axis.workspace.pantinsDirectory, "axis");
    await rm(join(folder, "io.csv"));
    await rm(join(folder, "io-modules.json"));
    plc.socket.close();
    await plc.closed;
    await expect.poll(async () => (await tagNamed(axis, COIL_EXTEND))?.value).toBe(0);
  });
});
