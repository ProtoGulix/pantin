import { networkInterfaces } from "node:os";
import { TAG_BUS_CLOSE_CODES } from "@pantin/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNetworkConfig } from "../domain/network-config.ts";
import { type BusAxis, startBarePantin, startBusAxis } from "../test-support/bus-axis.ts";
import { type BusClient, connectBus, connectBusAt } from "../test-support/bus-client.ts";
import { fakeMappingSource, PLC_MAPPING_ID } from "../test-support/fake-io-mapping.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { createBusRegistry } from "./bus-registry.ts";
import type { BusService } from "./bus-session.ts";
import type { BusSocket } from "./bus-socket.ts";

// Where the plc role may come from (ADR 0046 point 6).

const HELLO_PLC = {
  type: "hello",
  version: 2,
  role: "plc",
  transport: "modbus_tcp_slave",
  mappingId: PLC_MAPPING_ID,
} as const;
const mappingSource = fakeMappingSource([]);

let axis: BusAxis | undefined;
const clients: BusClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }
  await axis?.close();
  axis = undefined;
});

function unused(): never {
  throw new Error("The role check must end the hello before the service is used.");
}

const UNUSED_SERVICE: BusService = {
  writeTag: unused,
  releaseTag: unused,
  releaseAllTags: unused,
  peekFeedSource: unused,
  bridgeConnected: unused,
  bridgeDisconnected: unused,
  plcModuleStatus: unused,
};

// The sockets of a machine cannot be made to come from a private address that
// is not the core's own, so the role check is driven through the registry with
// a socket that only records what the core does to it.
async function plcHelloFrom(
  listen: string,
  remoteAddress: string | undefined,
): Promise<number | undefined> {
  const result = resolveNetworkConfig(listen);
  if (!result.ok) {
    throw new Error(result.message);
  }
  const closes: number[] = [];
  const socket: BusSocket = {
    send: () => undefined,
    close: (code) => closes.push(code),
    ping: () => undefined,
    bufferedAmount: () => 0,
    terminate: () => undefined,
  };
  const registry = createBusRegistry({
    service: UNUSED_SERVICE,
    network: result.config,
    mappingSource,
    timer: createManualTimer().timer,
    reportError: (error) => {
      throw error;
    },
  });
  const connection = registry.attach(socket, { pantinId: "axis", remoteAddress });
  connection?.receive(JSON.stringify(HELLO_PLC), false);
  await new Promise((resolve) => setImmediate(resolve));
  registry.closeAll();
  return closes[0];
}

describe("close 4005: role not accepted from this source", () => {
  it("refuses the plc role from a private address other than the core's, in local mode", async () => {
    expect(await plcHelloFrom("127.0.0.1", "192.168.1.30")).toBe(
      TAG_BUS_CLOSE_CODES.roleNotAccepted,
    );
  });

  it("refuses the plc role from another private address in lan mode too", async () => {
    expect(await plcHelloFrom("192.168.1.20", "192.168.1.30")).toBe(
      TAG_BUS_CLOSE_CODES.roleNotAccepted,
    );
    expect(await plcHelloFrom("192.168.1.20", "10.0.0.5")).toBe(
      TAG_BUS_CLOSE_CODES.roleNotAccepted,
    );
  });

  it("refuses a source that is no address at all", async () => {
    expect(await plcHelloFrom("127.0.0.1", undefined)).toBe(TAG_BUS_CLOSE_CODES.roleNotAccepted);
  });
});

describe("the plc role is accepted from the core's own host", () => {
  it("accepts a loopback source, 127.0.0.1 or any other 127.x address", async () => {
    const running = await startBusAxis({ ioMappingSource: mappingSource });
    axis = running;
    for (const localAddress of [undefined, "127.0.0.5"]) {
      // The slot of the previous plc is freed when the core sees its close.
      await expect
        .poll(async () => {
          const client = await connectBus(
            running.server,
            localAddress === undefined ? {} : { localAddress },
          );
          clients.push(client);
          client.send(HELLO_PLC);
          const outcome = await Promise.race([
            client.next("welcome").then(() => "welcome"),
            client.closed.then(({ code }) => String(code)),
          ]);
          if (outcome === "welcome") {
            client.socket.close();
            await client.closed;
          }
          return outcome;
        })
        .toBe("welcome");
    }
  });
});

// The first private IPv4 address of this machine, if it has one.
function privateAddress(): string | undefined {
  return Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === "IPv4" && classifyPrivate(entry.address))?.address;
}

function classifyPrivate(address: string): boolean {
  const result = resolveNetworkConfig(address);
  return result.ok && result.config.mode === "lan";
}

describe("lan mode", () => {
  const address = privateAddress();

  it.skipIf(address === undefined)(
    "accepts the plc role from the core's listen address",
    async () => {
      if (address === undefined) {
        return;
      }
      const pantin = await startBarePantin({ listen: address, ioMappingSource: mappingSource });
      try {
        const client = await connectBusAt(address, pantin.server.address.port);
        clients.push(client);
        client.send(HELLO_PLC);
        expect((await client.next("welcome")).type).toBe("welcome");
      } finally {
        await pantin.close();
      }
    },
  );
});
