import { createConnection, createServer, type Socket } from "node:net";

// A TCP relay in front of the test server that can go silent, like a PLC whose network was cut:
// once stalled it keeps the connections open and forwards nothing, in either direction. It is
// how the tests make a server stop publishing without touching the library's internals.

export type StallProxy = {
  port: number;
  stall(): void;
  close(): Promise<void>;
};

export async function startStallProxy(upstreamPort: number): Promise<StallProxy> {
  const sockets = new Set<Socket>();
  let stalled = false;
  const relay = (from: Socket, to: Socket): void => {
    from.on("data", (chunk) => {
      if (!stalled) {
        to.write(chunk);
      }
    });
    from.on("close", () => to.destroy());
    from.on("error", () => to.destroy());
  };
  const server = createServer((client) => {
    const upstream = createConnection({ host: "127.0.0.1", port: upstreamPort });
    sockets.add(client).add(upstream);
    relay(client, upstream);
    relay(upstream, client);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The stall proxy has no TCP address.");
  }
  return {
    port: address.port,
    stall: () => {
      stalled = true;
    },
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
