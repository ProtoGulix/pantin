import { IoMappingResponseSchema, TAG_BUS_CLOSE_CODES, type TransportKind } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BusAxis,
  COIL_EXTEND,
  COIL_RETRACT,
  SETPOINT,
  startBusAxis,
} from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";
import { tagNamed } from "../test-support/bus-rest.ts";
import { callIo } from "../test-support/io-edits.ts";
import { sendRaw } from "../test-support/test-server.ts";

// One plc connection per (Pantin, transport) and a mapping id per projection (ADR 0065
// point 7): a Modbus bridge and an OPC UA bridge run side by side on one Pantin.

const MODBUS: TransportKind = "modbus_tcp_slave";
const OPCUA: TransportKind = "opcua_client";

// WebSocket.OPEN (RFC 6455 readyState).
const OPEN = 1;

let axis: BusAxis;
const clients: BusClient[] = [];

// m1 is a Modbus module, m2 an OPC UA module with its namespace; each maps its own commands.
beforeEach(async () => {
  axis = await startBusAxis();
  await callIo(axis, "POST", "/modules", { transport: { kind: MODBUS } });
  await callIo(axis, "POST", "/modules/m1/channels", { tags: [COIL_EXTEND] });
  await callIo(axis, "POST", "/modules", {
    transport: { kind: OPCUA, namespaceUri: "urn:plc" },
  });
  await callIo(axis, "POST", "/modules/m2/channels", { tags: [COIL_RETRACT, SETPOINT] });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }
  await axis.close();
});

async function projectionId(transport: TransportKind): Promise<string> {
  const response = await sendRaw(axis.server, "GET", `/api/pantins/axis/io?transport=${transport}`);
  const id = IoMappingResponseSchema.parse(response.json).mappingId;
  if (id === null) {
    throw new Error("The mapping should exist.");
  }
  return id;
}

async function helloPlc(transport: TransportKind, mappingId?: string): Promise<BusClient> {
  const plc = await connectBus(axis.server);
  clients.push(plc);
  plc.send({
    type: "hello",
    version: 2,
    role: "plc",
    transport,
    mappingId: mappingId ?? (await projectionId(transport)),
  });
  return plc;
}

async function welcomedPlc(transport: TransportKind): Promise<BusClient> {
  const plc = await helloPlc(transport);
  await plc.next("welcome");
  return plc;
}

async function welcomedClient(): Promise<BusClient> {
  const client = await connectBus(axis.server);
  clients.push(client);
  client.send({ type: "hello", version: 2, role: "client" });
  await client.next("welcome");
  return client;
}

const ioChangedOf = (client: BusClient) =>
  client.received.filter((message) => message.type === "io_changed");

describe("one plc connection per transport", () => {
  it("accepts a plc of each transport at once", async () => {
    const modbus = await welcomedPlc(MODBUS);
    const opcua = await welcomedPlc(OPCUA);
    expect([modbus.socket.readyState, opcua.socket.readyState]).toEqual([OPEN, OPEN]);
  });

  it("refuses a second plc of the same transport with 4002, and accepts it once the first left", async () => {
    const first = await welcomedPlc(OPCUA);
    const second = await helloPlc(OPCUA);
    expect((await second.closed).code).toBe(TAG_BUS_CLOSE_CODES.plcAlreadyConnected);
    first.socket.close();
    await first.closed;
    await expect
      .poll(async () => {
        const retry = await helloPlc(OPCUA);
        return (await Promise.race([retry.next("welcome"), retry.closed.then(() => null)]))?.type;
      })
      .toBe("welcome");
  });

  it("refuses a hello whose id is another transport's projection with 4003", async () => {
    const plc = await helloPlc(OPCUA, await projectionId(MODBUS));
    expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.mappingMismatch);
  });

  it("refuses a hello of version 1, which has no transport, with 4001", async () => {
    const plc = await connectBus(axis.server);
    clients.push(plc);
    plc.send({ type: "hello", version: 1, role: "plc", mappingId: await projectionId(MODBUS) });
    expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.unsupportedVersion);
  });

  it("refuses a plc hello with no transport and a client hello with one with 4000", async () => {
    const plc = await connectBus(axis.server);
    clients.push(plc);
    plc.send({ type: "hello", version: 2, role: "plc", mappingId: await projectionId(MODBUS) });
    expect((await plc.closed).code).toBe(TAG_BUS_CLOSE_CODES.invalidMessage);
    const client = await connectBus(axis.server);
    clients.push(client);
    client.send({ type: "hello", version: 2, role: "client", transport: MODBUS });
    expect((await client.closed).code).toBe(TAG_BUS_CLOSE_CODES.invalidMessage);
  });
});

describe("a transport whose projection is invalid", () => {
  it("does not stop the other transport's plc from connecting", async () => {
    await callIo(axis, "PATCH", "/modules/m2", {
      transport: { kind: OPCUA, namespaceUri: "" },
    });
    const refused = await helloPlc(OPCUA, "any");
    expect((await refused.closed).code).toBe(TAG_BUS_CLOSE_CODES.mappingMismatch);
    const modbus = await welcomedPlc(MODBUS);
    expect(modbus.socket.readyState).toBe(OPEN);
  });
});

describe("io_changed per transport", () => {
  it("goes to the plc whose projection changed, and not to the other", async () => {
    const modbus = await welcomedPlc(MODBUS);
    const opcua = await welcomedPlc(OPCUA);
    await callIo(axis, "PATCH", "/modules/m2", { transport: { kind: OPCUA, gvlName: "GVL_B" } });
    axis.runSeconds(1);
    await opcua.next("io_changed");
    await modbus.barrier();
    expect(ioChangedOf(modbus)).toEqual([]);

    await callIo(axis, "PATCH", "/modules/m1", { transport: { kind: MODBUS, unitId: 9 } });
    axis.runSeconds(1);
    await modbus.next("io_changed");
  });

  it("goes to a client for any change of the file", async () => {
    const client = await welcomedClient();
    await callIo(axis, "PATCH", "/modules/m2", { transport: { kind: OPCUA, gvlName: "GVL_B" } });
    axis.runSeconds(1);
    await client.next("io_changed");
  });

  it("does not go to a Modbus plc when an OPC UA module goes invalid", async () => {
    const modbus = await welcomedPlc(MODBUS);
    await callIo(axis, "PATCH", "/modules/m2", { transport: { kind: OPCUA, namespaceUri: "" } });
    axis.runSeconds(1);
    await modbus.barrier();
    expect(ioChangedOf(modbus)).toEqual([]);
  });
});

describe("zeroing per transport (ADR 0065 point 6)", () => {
  async function writeAs(plc: BusClient, id: string, tag: string, value: number): Promise<void> {
    plc.send({ type: "write", id, tag, value });
    await plc.next("ack");
  }

  it("resets only the commands of the transport whose plc closed", async () => {
    const modbus = await welcomedPlc(MODBUS);
    const opcua = await welcomedPlc(OPCUA);
    await writeAs(modbus, "w1", COIL_EXTEND, 1);
    await writeAs(opcua, "w2", COIL_RETRACT, 1);
    opcua.socket.close();
    await opcua.closed;
    await expect.poll(async () => (await tagNamed(axis, COIL_RETRACT))?.value).toBe(0);
    expect((await tagNamed(axis, COIL_EXTEND))?.value).toBe(1);
  });

  it("keeps the bridge connected while one transport's plc is left", async () => {
    const modbus = await welcomedPlc(MODBUS);
    const opcua = await welcomedPlc(OPCUA);
    opcua.socket.close();
    await opcua.closed;
    await writeAs(modbus, "w1", COIL_EXTEND, 1);
    const list = await sendRaw(axis.server, "GET", "/api/pantins/axis/bridges");
    // Per kind: the Modbus bridge is still there, the OPC UA one left.
    expect(list.json).toMatchObject({
      bridges: [
        { transport: "modbus_tcp_slave", externalBridgeConnected: true },
        { transport: "opcua_client", externalBridgeConnected: false },
      ],
    });
  });

  it("ignores a plc_status for a module of another transport, and never marks it connected", async () => {
    const opcua = await welcomedPlc(OPCUA);
    await writeAs(opcua, "w1", COIL_EXTEND, 1);
    opcua.send({ type: "plc_status", module: "m1", connected: false, reason: "closed" });
    expect((await opcua.next("error")).code).toBe("invalid_request");
    expect((await tagNamed(axis, COIL_EXTEND))?.value).toBe(1);
    opcua.send({ type: "plc_status", module: "m1", connected: true, reason: null });
    await opcua.next("error");
    const status = await sendRaw(axis.server, "GET", "/api/pantins/axis/bridges");
    expect(JSON.stringify(status.json)).not.toContain('"plcConnected":true');
  });

  it("accepts the OPC UA loss reasons of a module and resets its commands", async () => {
    const opcua = await welcomedPlc(OPCUA);
    await writeAs(opcua, "w1", COIL_RETRACT, 1);
    for (const reason of ["node_mismatch", "certificate_rejected"] as const) {
      await writeAs(opcua, `w-${reason}`, COIL_RETRACT, 1);
      opcua.send({ type: "plc_status", module: "m2", connected: false, reason });
      await opcua.barrier();
      expect((await tagNamed(axis, COIL_RETRACT))?.value).toBe(0);
    }
  });
});
