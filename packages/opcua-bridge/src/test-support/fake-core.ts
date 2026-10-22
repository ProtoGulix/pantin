import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type IoMappingResponse,
  TAG_BUS_VERSION,
  type TagBusServerMessage,
} from "@pantin/protocol";
import { type RawData, type WebSocket, WebSocketServer } from "ws";

// A core reduced to what the bridge talks to: `GET .../io?transport=...` over HTTP and the
// tag bus over a real WebSocket, both on 127.0.0.1 with a free port. Its answers are checked
// by the same schemas the real core uses, in the tests that read them.

export const FAKE_PANTIN_ID = "press";

const WELCOME: TagBusServerMessage = {
  type: "welcome",
  version: TAG_BUS_VERSION,
  consoleId: "c-1",
  clock: { running: true, step: 0, stepSeconds: 1 / 120, achievedRatio: 1, droppedSteps: 0 },
};

export type FakeCoreOptions = {
  projection: IoMappingResponse;
  // Closes the bus right after the hello, with this code, instead of the welcome.
  refuseHelloWith?: { code: number; reason: string };
  // Answers the hello with a message that is not a welcome.
  answerHelloWith?: unknown;
  // Never answers the hello: a core that accepted the connection and then went quiet.
  silentOnHello?: boolean;
};

export type FakeCore = {
  /** `http://127.0.0.1:<port>`, the value of --core. */
  url: string;
  ioRequestUrls: string[];
  /** Every JSON message the bridge sent on the bus. */
  received: unknown[];
  send(message: unknown): void;
  sendRaw(data: string | Buffer, binary?: boolean): void;
  closeBus(code: number, reason: string): void;
  nextMessage(type: string): Promise<unknown>;
  /** Resolves with the first message of the bridge that satisfies `predicate`, now or later. */
  untilMessage(predicate: (message: unknown) => boolean): Promise<unknown>;
  close(): Promise<void>;
};

function messageTypeOf(message: unknown): unknown {
  return typeof message === "object" && message !== null && "type" in message
    ? message.type
    : undefined;
}

type MessageLog = {
  received: unknown[];
  deliver(message: unknown): void;
  untilMessage(predicate: (message: unknown) => boolean): Promise<unknown>;
};

// What the bridge sent, and the promises waiting for one message of it.
function createMessageLog(): MessageLog {
  const received: unknown[] = [];
  const waiters: Array<{
    matches: (message: unknown) => boolean;
    resolve: (message: unknown) => void;
  }> = [];
  return {
    received,
    deliver: (message) => {
      received.push(message);
      for (const waiter of waiters.splice(0)) {
        if (waiter.matches(message)) {
          waiter.resolve(message);
        } else {
          waiters.push(waiter);
        }
      }
    },
    untilMessage: (matches) => {
      const already = received.find(matches);
      if (already !== undefined) {
        return Promise.resolve(already);
      }
      return new Promise((resolve) => waiters.push({ matches, resolve }));
    },
  };
}

function answerHello(socket: WebSocket, options: FakeCoreOptions): void {
  if (options.silentOnHello === true) {
    return;
  }
  if (options.refuseHelloWith !== undefined) {
    socket.close(options.refuseHelloWith.code, options.refuseHelloWith.reason);
  } else {
    socket.send(JSON.stringify(options.answerHelloWith ?? WELCOME));
  }
}

type CoreServers = {
  http: Server;
  bus: WebSocketServer;
  ioRequestUrls: string[];
  /** The socket of the latest bridge connection. */
  bridgeSocket(): WebSocket | undefined;
};

function createServers(options: FakeCoreOptions, log: MessageLog): CoreServers {
  const ioRequestUrls: string[] = [];
  let bridgeSocket: WebSocket | undefined;
  const http = createServer((request, response) => {
    ioRequestUrls.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(options.projection));
  });
  const bus = new WebSocketServer({ server: http, path: `/api/pantins/${FAKE_PANTIN_ID}/bus` });
  bus.on("connection", (socket) => {
    bridgeSocket = socket;
    socket.on("message", (data: RawData) => {
      const message: unknown = JSON.parse(data.toString("utf8"));
      log.deliver(message);
      if (messageTypeOf(message) === "hello") {
        answerHello(socket, options);
      }
    });
  });
  return { http, bus, ioRequestUrls, bridgeSocket: () => bridgeSocket };
}

async function closeServers({ http, bus }: CoreServers): Promise<void> {
  for (const client of bus.clients) {
    client.terminate();
  }
  await new Promise((resolve) => bus.close(resolve));
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
}

export async function startFakeCore(options: FakeCoreOptions): Promise<FakeCore> {
  const log = createMessageLog();
  const servers = createServers(options, log);
  await new Promise<void>((resolve) => servers.http.listen(0, "127.0.0.1", resolve));
  const { port } = servers.http.address() as AddressInfo; // listen(0, host) always returns an AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    ioRequestUrls: servers.ioRequestUrls,
    received: log.received,
    send: (message) => servers.bridgeSocket()?.send(JSON.stringify(message)),
    sendRaw: (data, binary = false) => servers.bridgeSocket()?.send(data, { binary }),
    closeBus: (code, reason) => servers.bridgeSocket()?.close(code, reason),
    nextMessage: (type) => log.untilMessage((message) => messageTypeOf(message) === type),
    untilMessage: log.untilMessage,
    close: () => closeServers(servers),
  };
}
