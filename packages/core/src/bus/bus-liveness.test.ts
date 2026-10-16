import { afterEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus } from "../test-support/bus-client.ts";

// Ping every second and an end to a connection that stops answering (ADR 0045
// point 4), on a manual bus clock.

let axis: BusAxis;
let client: BusClient;

afterEach(async () => {
  client.socket.terminate();
  await axis.close();
});

async function openClient(autoPong: boolean): Promise<void> {
  axis = await startBusAxis();
  client = await connectBus(axis.server, { autoPong });
  client.send({ type: "hello", version: 1, role: "client" });
  await client.next("welcome");
}

describe("liveness", () => {
  it("pings once per second of the bus clock", async () => {
    await openClient(true);
    expect(client.pingCount()).toBe(0);
    for (let second = 1; second <= 3; second += 1) {
      axis.busClock.advance(1);
      await expect.poll(() => client.pingCount()).toBe(second);
    }
  });

  it("keeps a client that answers its pings", async () => {
    await openClient(true);
    for (let second = 1; second <= 10; second += 1) {
      axis.busClock.advance(1);
      await expect.poll(() => client.pingCount()).toBe(second);
      // Frames keep their order: the reply to this means the pong was read.
      await client.barrier();
    }
    expect(client.socket.readyState).toBe(client.socket.OPEN);
  });

  it("ends a connection with no pong for 3 seconds", async () => {
    await openClient(false);
    axis.busClock.advance(1);
    axis.busClock.advance(1);
    await client.barrier();
    expect(client.socket.readyState).toBe(client.socket.OPEN);
    axis.busClock.advance(1);
    // Dropped with no closing handshake: the abnormal closure code.
    expect((await client.closed).code).toBe(1006);
  });
});
