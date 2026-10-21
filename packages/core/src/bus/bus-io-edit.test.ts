import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";
import { COIL, callIo } from "../test-support/io-edits.ts";
import { sendJsonRequest } from "../test-support/test-server.ts";

// io_changed follows the open mapping through its mappingId (ADR 0049 point 7):
// a route edit sends it with no tag change at all.

let axis: BusAxis;
let client: BusClient;

beforeEach(async () => {
  axis = await startBusAxis();
  client = await connectBus(axis.server);
  client.send({ type: "hello", version: 1, role: "client" });
  await client.next("welcome");
});

afterEach(async () => {
  client.socket.terminate();
  await axis.close();
});

describe("io_changed on a route edit", () => {
  it("is sent after each edit and not after a tick with nothing new", async () => {
    axis.runSeconds(1);
    await client.barrier();
    expect(client.received.filter((message) => message.type === "io_changed")).toEqual([]);
    await callIo(axis, "POST", "/modules", { transport: { kind: "modbus_tcp_slave" } });
    axis.runSeconds(1);
    await client.next("io_changed");
    await callIo(axis, "POST", "/modules/m1/channels", { tags: [COIL] });
    axis.runSeconds(1);
    await client.next("io_changed");
  });

  it("is sent after a rename, whose mappingId changes with the carried channel", async () => {
    await callIo(axis, "POST", "/modules", { transport: { kind: "modbus_tcp_slave" } });
    await callIo(axis, "POST", "/modules/m1/channels", { tags: [COIL] });
    axis.runSeconds(1);
    await client.next("io_changed");
    const renamed = await sendJsonRequest(
      axis.server,
      "PUT",
      "/api/pantins/axis/drives/valve/tag-key",
      { tagKey: "distributeur" },
    );
    expect(renamed.status).toBe(200);
    axis.runSeconds(1);
    await client.next("io_changed");
  });
});
