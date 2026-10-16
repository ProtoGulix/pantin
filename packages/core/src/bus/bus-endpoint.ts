import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  API_PREFIX,
  type ApiErrorCode,
  type PantinId,
  PantinIdSchema,
  TAG_BUS_MAX_CONNECTIONS,
  TAG_BUS_MAX_MESSAGE_BYTES,
} from "@pantin/protocol";
import { type WebSocket, WebSocketServer } from "ws";
import { checkUpgradeHeaders, EXPOSURE_HEADER } from "../domain/bus-upgrade-rules.ts";
import type { IoMappingSource } from "../domain/io-mapping.ts";
import type { NetworkConfig } from "../domain/network-config.ts";
import { ApiError } from "../errors.ts";
import { parseRequestTarget } from "../http/route-matching.ts";
import type { PantinService } from "../service/pantin-service.ts";
import type { SimulationTimer } from "../service/simulation-loop.ts";
import { type BusRegistry, createBusRegistry } from "./bus-registry.ts";
import type { BusService } from "./bus-session.ts";
import { adaptWebSocket, rawDataToText } from "./bus-socket.ts";

// The HTTP side of the tag bus (ADR 0045 point 4, ADR 0046 points 5 and 7):
// `GET /api/pantins/:pantinId/bus` upgraded to a WebSocket. The TCP connection
// already passed the source filter at accept; the checks here are the Host,
// the Origin and the exposure header, then the cap, then the Pantin.

export type BusEndpoint = {
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  notifyTick(): void;
  closeAll(): void;
};

export type BusEndpointOptions = {
  service: BusService & Pick<PantinService, "getClock">;
  network: NetworkConfig;
  mappingSource: IoMappingSource;
  timer: SimulationTimer;
  reportError: (error: unknown) => void;
};

const STATUS_TEXT: Readonly<Record<number, string>> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  421: "Misdirected Request",
  500: "Internal Server Error",
};

// Answers the handshake with an HTTP error, then closes the socket.
function refuse(socket: Duplex, status: number, code: ApiErrorCode, message: string): void {
  const body = JSON.stringify({ error: { code, message } });
  socket.end(
    [
      `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}`,
      "connection: close",
      "content-type: application/json",
      `content-length: ${Buffer.byteLength(body)}`,
      "",
      body,
    ].join("\r\n"),
    () => socket.destroy(),
  );
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(",") : value;
}

// The bus route is /api/pantins/<id>/bus; any other upgrade is a 404.
function busPantinIdOf(request: IncomingMessage) {
  const { segments } = parseRequestTarget(request.url ?? "/");
  const [prefix, pantins, id, bus, ...rest] = segments;
  if (`/${prefix}` !== API_PREFIX || pantins !== "pantins" || bus !== "bus" || rest.length > 0) {
    return undefined;
  }
  return PantinIdSchema.safeParse(id);
}

type EndpointState = {
  options: BusEndpointOptions;
  webSocketServer: WebSocketServer;
  registry: BusRegistry;
};

function openConnection(
  state: EndpointState,
  request: IncomingMessage,
  socket: Duplex,
  upgradeHead: Buffer,
  pantinId: PantinId,
): void {
  const remoteAddress = request.socket.remoteAddress;
  state.webSocketServer.handleUpgrade(request, socket, upgradeHead, (webSocket: WebSocket) => {
    const connection = state.registry.attach(adaptWebSocket(webSocket), {
      pantinId,
      remoteAddress,
    });
    if (connection === null) {
      // The cap was reached while the Pantin was loading: 1013 is "try again later".
      webSocket.close(1013, "Too many tag bus connections.");
      return;
    }
    webSocket.on("message", (data, isBinary) => connection.receive(rawDataToText(data), isBinary));
    webSocket.on("pong", () => connection.pongReceived(state.options.timer.now()));
    // ws closes the connection with the right code by itself (1009 for a
    // message over the limit, 1007 for bad UTF-8) and 'close' follows.
    webSocket.on("error", () => undefined);
    webSocket.on("close", () => connection.closed());
  });
}

async function upgrade(
  state: EndpointState,
  request: IncomingMessage,
  socket: Duplex,
  upgradeHead: Buffer,
): Promise<void> {
  const { options, registry } = state;
  const headerRefusal = checkUpgradeHeaders(
    options.network,
    {
      host: headerValue(request, "host"),
      origin: headerValue(request, "origin"),
      exposure: headerValue(request, EXPOSURE_HEADER),
    },
    request.socket.localPort ?? 0,
  );
  if (headerRefusal !== null) {
    refuse(socket, headerRefusal.status, headerRefusal.code, headerRefusal.message);
    return;
  }
  const target = busPantinIdOf(request);
  if (target === undefined || request.method !== "GET") {
    refuse(
      socket,
      404,
      "not_found",
      `No upgrade at ${request.url}. The bus is ${API_PREFIX}/pantins/<id>/bus.`,
    );
  } else if (!target.success) {
    refuse(socket, 400, "invalid_request", "The Pantin id in the URL is not valid.");
  } else if (registry.isFull()) {
    refuse(
      socket,
      409,
      "conflict",
      `The core already serves ${TAG_BUS_MAX_CONNECTIONS} tag bus connections. Close one and retry.`,
    );
  } else {
    // Opens the Pantin as any route does; an unknown id ends here with a 404.
    await options.service.getClock(target.data);
    openConnection(state, request, socket, upgradeHead, target.data);
  }
}

export function createBusEndpoint(options: BusEndpointOptions): BusEndpoint {
  const state: EndpointState = {
    options,
    // noServer: the core's HTTP server owns the port and the upgrade event.
    webSocketServer: new WebSocketServer({ noServer: true, maxPayload: TAG_BUS_MAX_MESSAGE_BYTES }),
    registry: createBusRegistry({
      service: options.service,
      network: options.network,
      mappingSource: options.mappingSource,
      timer: options.timer,
      reportError: options.reportError,
    }),
  };
  return {
    handleUpgrade: (request, socket, upgradeHead) => {
      // Node removes its own error listener from an upgraded socket: without
      // this one, a reset during the checks would crash the core.
      socket.on("error", () => undefined);
      upgrade(state, request, socket, upgradeHead).catch((error: unknown) => {
        if (error instanceof ApiError) {
          refuse(socket, error.httpStatus, error.code, error.message);
          return;
        }
        options.reportError(error);
        refuse(
          socket,
          500,
          "internal_error",
          "Unexpected server error; see the core logs for details.",
        );
      });
    },
    notifyTick: () => state.registry.notifyTick(),
    closeAll: () => state.registry.closeAll(),
  };
}
