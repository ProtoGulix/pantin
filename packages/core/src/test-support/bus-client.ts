import {
  type TagBusClientMessage,
  type TagBusServerMessage,
  TagBusServerMessageSchema,
} from "@pantin/protocol";
import { WebSocket } from "ws";
import type { RunningPantinServer } from "../http/server.ts";

// A real `ws` client of the tag bus. Every message the core sends is checked
// against the protocol schema as it arrives, so a drift fails the test that
// provoked it.

export type ConnectOptions = {
  pantinId?: string;
  headers?: Record<string, string>;
  localAddress?: string;
  // False: the client never answers a ping (a bridge that hangs).
  autoPong?: boolean;
  // Sent as the Host header instead of the server's address, to test the Host check.
  host?: string;
};

type OfType<Type extends TagBusServerMessage["type"]> = Extract<
  TagBusServerMessage,
  { type: Type }
>;

export type BusClient = {
  socket: WebSocket;
  received: TagBusServerMessage[];
  send(message: TagBusClientMessage | Record<string, unknown>): void;
  // The first not yet taken message of this type, waiting for it if needed.
  next<Type extends TagBusServerMessage["type"]>(type: Type): Promise<OfType<Type>>;
  // Everything the core sent before this call has arrived (frames keep their order).
  barrier(): Promise<void>;
  closed: Promise<{ code: number; reason: string }>;
  pingCount(): number;
  // The core has read every pong sent before this call, without sending it a message.
  pongBarrier(): Promise<void>;
};

function handshakeOptions(options: ConnectOptions) {
  const { headers = {}, autoPong = true, localAddress, host } = options;
  return {
    autoPong,
    // The Host header is set by ws from the URL unless a header says otherwise.
    headers: host === undefined ? headers : { ...headers, Host: host },
    ...(localAddress === undefined ? {} : { localAddress }),
  };
}

export function connectBus(
  server: RunningPantinServer,
  options: ConnectOptions = {},
): Promise<BusClient> {
  const url = `ws://127.0.0.1:${server.address.port}/api/pantins/${options.pantinId ?? "axis"}/bus`;
  return openedClient(new WebSocket(url, handshakeOptions(options)));
}

/** Connects to the server's address, even when it is not loopback (lan mode). */
export function connectBusAt(
  address: string,
  port: number,
  options: ConnectOptions = {},
): Promise<BusClient> {
  const url = `ws://${address}:${port}/api/pantins/${options.pantinId ?? "axis"}/bus`;
  return openedClient(new WebSocket(url, handshakeOptions(options)));
}

// The core answers a ping after reading the frames sent before it.
function pongBarrier(socket: WebSocket): Promise<void> {
  const answered = new Promise<void>((resolve) => socket.once("pong", () => resolve()));
  socket.ping();
  return answered;
}

function closedPromise(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function openedClient(socket: WebSocket): Promise<BusClient> {
  const received: TagBusServerMessage[] = [];
  const waiting: (() => void)[] = [];
  let pings = 0;
  let barriers = 0;
  socket.on("ping", () => {
    pings += 1;
  });
  socket.on("message", (data) => {
    received.push(TagBusServerMessageSchema.parse(JSON.parse(String(data))));
    for (const wake of waiting.splice(0)) {
      wake();
    }
  });
  const closed = closedPromise(socket);
  const next = async <Type extends TagBusServerMessage["type"]>(type: Type) => {
    for (;;) {
      const index = received.findIndex((message) => message.type === type);
      const found = received[index];
      if (found !== undefined) {
        received.splice(index, 1);
        // The search guarantees the type; TypeScript cannot narrow through findIndex.
        return found as OfType<Type>;
      }
      await new Promise<void>((wake) => waiting.push(wake));
    }
  };
  const client: BusClient = {
    socket,
    received,
    send: (message) => socket.send(JSON.stringify(message)),
    next,
    barrier: async () => {
      barriers += 1;
      const id = `barrier-${barriers}`;
      // A write to a tag that does not exist: answered with an error, changes nothing.
      client.send({ type: "write", id, tag: "none.none.none", value: 0 });
      for (;;) {
        const error = await next("error");
        if (error.id === id) {
          return;
        }
      }
    },
    closed,
    pingCount: () => pings,
    pongBarrier: () => pongBarrier(socket),
  };
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(client));
    socket.once("error", reject);
  });
}

export type Refusal = { status: number; body: string } | { error: string };

/** The status the core answered to a handshake it refused, or the error of a dropped socket. */
export function refusedHandshake(
  server: RunningPantinServer,
  options: ConnectOptions & { path?: string } = {},
): Promise<Refusal> {
  const path = options.path ?? `/api/pantins/${options.pantinId ?? "axis"}/bus`;
  const socket = new WebSocket(
    `ws://127.0.0.1:${server.address.port}${path}`,
    handshakeOptions(options),
  );
  return new Promise((resolve) => {
    socket.once("unexpected-response", (_request, response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        socket.terminate();
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    socket.once("open", () => {
      socket.close();
      resolve({ error: "the handshake was accepted" });
    });
    socket.once("error", (error) => resolve({ error: error.message }));
  });
}
