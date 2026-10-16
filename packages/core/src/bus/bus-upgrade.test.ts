import { afterEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus, refusedHandshake } from "../test-support/bus-client.ts";

// The checks before a tag bus connection opens (ADR 0046 points 5 and 7).

let axis: BusAxis;
const clients: BusClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }
  await axis.close();
});

async function connected(headers: Record<string, string> = {}): Promise<BusClient> {
  const client = await connectBus(axis.server, { headers });
  clients.push(client);
  return client;
}

const port = () => axis.server.address.port;

describe("Origin", () => {
  it("accepts a connection with no Origin: a program, not a browser", async () => {
    axis = await startBusAxis();
    const client = await connected();
    client.send({ type: "hello", version: 1, role: "client" });
    expect((await client.next("welcome")).version).toBe(1);
  });

  it.each(["http://127.0.0.1", "http://localhost"])(
    "accepts %s with the core's port",
    async (origin) => {
      axis = await startBusAxis();
      const client = await connected({ Origin: `${origin}:${port()}` });
      client.send({ type: "hello", version: 1, role: "client" });
      expect((await client.next("welcome")).type).toBe("welcome");
    },
  );

  it.each([
    ["a foreign site", "http://evil.example"],
    ["a foreign site on the core's port", "http://evil.example:{port}"],
    ["the core's host on another port", "http://127.0.0.1:1"],
    ["the core's host with no port", "http://127.0.0.1"],
    ["https", "https://127.0.0.1:{port}"],
    ["a path after the host", "http://127.0.0.1:{port}/page"],
    ["an opaque origin", "null"],
  ])("refuses %s with 403", async (_name, origin) => {
    axis = await startBusAxis();
    const refusal = await refusedHandshake(axis.server, {
      headers: { Origin: origin.replace("{port}", String(port())) },
    });
    expect(refusal).toMatchObject({ status: 403 });
  });
});

describe("Host", () => {
  it.each(["evil.example", "evil.example:80", "127.0.0.1:1", "192.168.1.10"])(
    "refuses Host %s with 421, before the Origin is looked at",
    async (host) => {
      axis = await startBusAxis();
      const refusal = await refusedHandshake(axis.server, {
        host,
        headers: { Origin: "http://evil.example" },
      });
      expect(refusal).toMatchObject({ status: 421 });
    },
  );
});

describe("exposure header (ADR 0046 point 7)", () => {
  it("refuses a bus upgrade that carries X-Pantin-Exposure, whatever its value", async () => {
    axis = await startBusAxis();
    for (const value of ["cloudflare", ""]) {
      const refusal = await refusedHandshake(axis.server, {
        headers: { "X-Pantin-Exposure": value },
      });
      expect(refusal).toMatchObject({ status: 403 });
    }
  });
});

describe("route and Pantin", () => {
  it.each([
    ["another path", "/api/pantins/axis/pose"],
    ["a longer path", "/api/pantins/axis/bus/more"],
    ["the root", "/"],
    ["an unknown Pantin", "/api/pantins/nothing/bus"],
  ])("answers 404 for %s", async (_name, path) => {
    axis = await startBusAxis();
    expect(await refusedHandshake(axis.server, { path })).toMatchObject({ status: 404 });
  });

  it("answers 400 for an id that is not one", async () => {
    axis = await startBusAxis();
    const refusal = await refusedHandshake(axis.server, { path: "/api/pantins/A%20B/bus" });
    expect(refusal).toMatchObject({ status: 400 });
  });
});

describe("connection cap", () => {
  it("serves 16 bus connections and answers 409 to the 17th, until one closes", async () => {
    axis = await startBusAxis();
    const open: BusClient[] = [];
    for (let index = 0; index < 16; index += 1) {
      open.push(await connected());
    }
    expect(await refusedHandshake(axis.server)).toMatchObject({ status: 409 });
    const [first] = open;
    first?.socket.close();
    await first?.closed;
    // The core learns of the close on its side a moment later.
    await expect
      .poll(async () => ("error" in (await refusedHandshake(axis.server)) ? "open" : "refused"))
      .toBe("open");
  });
});
