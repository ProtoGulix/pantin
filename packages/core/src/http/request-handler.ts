import type { IncomingMessage, ServerResponse } from "node:http";
import { API_PREFIX } from "@pantin/protocol";
import {
  describeAcceptedHosts,
  isHostAccepted,
  type NetworkConfig,
} from "../domain/network-config.ts";
import { ApiError } from "../errors.ts";
import type { PantinService } from "../service/pantin-service.ts";
import type { PoseStreamRegistry } from "./pose-stream-registry.ts";
import { sendApiError } from "./responses.ts";
import { matchPattern, parseRequestTarget } from "./route-matching.ts";
import { methodNotAllowed, ROUTES } from "./routes.ts";
import { serveViewerFile } from "./static-files.ts";

export type RequestHandlerOptions = {
  service: PantinService;
  poseStreams: PoseStreamRegistry;
  network: NetworkConfig;
  maxImportBytes: number;
  viewerDirectory: string | undefined;
  // Receives unexpected errors (the client only gets a generic message).
  reportError: (error: unknown) => void;
};

function assertAcceptedHost(network: NetworkConfig, request: IncomingMessage): void {
  const port = request.socket.localPort ?? 0;
  const host = request.headers.host;
  if (!isHostAccepted(network, host, port)) {
    throw new ApiError(
      "invalid_request",
      `Host "${host ?? ""}" is not accepted. Open the core at ${describeAcceptedHosts(network, port)}.`,
      421,
    );
  }
}

async function dispatchApi(
  options: RequestHandlerOptions,
  routeSegments: readonly string[],
  query: URLSearchParams,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const matching = ROUTES.map((route) => ({
    route,
    parameters: matchPattern(route.pattern, routeSegments),
  })).filter((candidate) => candidate.parameters !== undefined);
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

async function dispatch(
  options: RequestHandlerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  assertAcceptedHost(options.network, request);
  const { segments, query } = parseRequestTarget(request.url ?? "/");
  const [prefix, ...routeSegments] = segments;
  if (`/${prefix}` === API_PREFIX) {
    await dispatchApi(options, routeSegments, query, request, response);
  } else if (options.viewerDirectory !== undefined) {
    await serveViewerFile(options.viewerDirectory, segments, request, response);
  } else {
    throw new ApiError(
      "not_found",
      `Nothing at ${request.url}. The API lives under ${API_PREFIX}/pantins.`,
    );
  }
}

function toApiError(error: unknown, reportError: (error: unknown) => void): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  reportError(error);
  return new ApiError("internal_error", "Unexpected server error; see the core logs for details.");
}

export function createRequestHandler(options: RequestHandlerOptions) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    // Browsers must never guess another type than the declared one (e.g. a
    // mesh file rendered as HTML).
    response.setHeader("x-content-type-options", "nosniff");
    dispatch(options, request, response).catch((error: unknown) => {
      sendApiError(response, toApiError(error, options.reportError));
    });
  };
}
