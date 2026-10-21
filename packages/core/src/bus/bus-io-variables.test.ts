import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";
import { COIL, callIo, OTHER_COIL } from "../test-support/io-edits.ts";
import { sendJsonRequest } from "../test-support/test-server.ts";

// A batch of variables is one edit: the mappingId changes once, so a running bridge gets
// one io_changed and restarts once (ADR 0064 point 13).

let axis: BusAxis;
let client: BusClient;

beforeEach(async () => {
  axis = await startBusAxis();
  client = await connectBus(axis.server);
  client.send({ type: "hello", version: 1, role: "client" });
  await client.next("welcome");
  await callIo(axis, "POST", "/modules", { transport: { kind: "modbus_tcp_slave" } });
  await callIo(axis, "POST", "/modules/m1/channels", { tags: [COIL, OTHER_COIL] });
  axis.runSeconds(1);
  await client.next("io_changed");
});

afterEach(async () => {
  client.socket.terminate();
  await axis.close();
});

const ioChanges = () => client.received.filter((message) => message.type === "io_changed");

describe("io_changed after POST .../io/variables", () => {
  it("is sent once for a batch of several variables", async () => {
    const seen = ioChanges().length;
    const response = await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/io/variables", {
      assignments: [
        { module: "m1", tag: COIL, variable: "GVL.extend" },
        { module: "m1", tag: OTHER_COIL, variable: "GVL.retract" },
      ],
    });
    expect(response.status).toBe(200);
    axis.runSeconds(1);
    await client.barrier();
    expect(ioChanges()).toHaveLength(seen + 1);
  });

  it("is not sent when every entry of the batch is skipped", async () => {
    const seen = ioChanges().length;
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/io/variables", {
      assignments: [{ module: "m1", tag: COIL, variable: "TYPE" }],
    });
    axis.runSeconds(1);
    await client.barrier();
    expect(ioChanges()).toHaveLength(seen);
  });
});
