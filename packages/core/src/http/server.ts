import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { API_PREFIX, MAX_IMPORT_BYTES } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { createPantinService, type PantinService } from "../service/pantin-service.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import { sendApiError } from "./responses.ts";
import { matchPattern, parseRequestTarget } from "./route-matching.ts";
import { methodNotAllowed, ROUTES } from "./routes.ts";

// Local mode of ADR 0004: the only address this slice ever listens on.
const LOCAL_HOST = "127.0.0.1";

export type PantinServerOptions = {
  pantinsDirectory: string;
  port: number;
  maxImportBytes?: number;
  // Receives unexpected errors (the client only gets a generic message).
  reportError: (error: unknown) => void;
};

export type RunningPantinServer = {
  server: Server;
  address: AddressInfo;
  close(): Promise<void>;
};

type HandlerOptions = { service: PantinService; maxImportBytes: number };

// Against DNS rebinding: a hostile web page whose domain resolves to
// 127.0.0.1 still sends its own name as Host, so only local names pass.
function assertLocalHost(request: IncomingMessage): void {
  const port = request.socket.localPort;
  const allowedHosts = [`${LOCAL_HOST}:${port}`, `localhost:${port}`];
  const host = request.headers.host;
  if (host === undefined || !allowedHosts.includes(host.toLowerCase())) {
    throw new ApiError(
      "invalid_request",
      `Host "${host ?? ""}" is not accepted. Open the core at http://${allowedHosts[0]} or http://${allowedHosts[1]}.`,
      421,
    );
  }
}

async function dispatch(
  options: HandlerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  assertLocalHost(request);
  const { segments, query } = parseRequestTarget(request.url ?? "/");
  const [prefix, ...routeSegments] = segments;
  const method = request.method ?? "GET";
  const candidates =
    `/${prefix}` === API_PREFIX
      ? ROUTES.map((route) => ({ route, parameters: matchPattern(route.pattern, routeSegments) }))
      : [];
  const matching = candidates.filter((candidate) => candidate.parameters !== undefined);
  if (matching.length === 0) {
    throw new ApiError(
      "not_found",
      `No API route for ${method} ${request.url}. See ${API_PREFIX}/pantins.`,
    );
  }
  const match = matching.find((candidate) => candidate.route.method === method);
  if (match === undefined || match.parameters === undefined) {
    throw methodNotAllowed(
      method,
      matching.map((candidate) => candidate.route.method),
    );
  }
  await match.route.handle({ ...options, request, response, parameters: match.parameters, query });
}

function toApiError(error: unknown, reportError: (error: unknown) => void): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  reportError(error);
  return new ApiError("internal_error", "Unexpected server error; see the core logs for details.");
}

function createPantinRequestHandler(
  options: HandlerOptions & Pick<PantinServerOptions, "reportError">,
) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    // Browsers must never guess another type than the declared one (e.g. a
    // mesh file rendered as HTML).
    response.setHeader("x-content-type-options", "nosniff");
    dispatch(options, request, response).catch((error: unknown) => {
      sendApiError(response, toApiError(error, options.reportError));
    });
  };
}

export async function startPantinServer(
  options: PantinServerOptions,
): Promise<RunningPantinServer> {
  const service = createPantinService(createPantinStore(options.pantinsDirectory));
  const handler = createPantinRequestHandler({
    service,
    maxImportBytes: options.maxImportBytes ?? MAX_IMPORT_BYTES,
    reportError: options.reportError,
  });
  const server = createServer(handler);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port, LOCAL_HOST, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  // listen() on a TCP host and port always yields an AddressInfo, never a string.
  const address = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
      server.closeAllConnections();
    });
  return { server, address, close };
}
