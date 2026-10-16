import { SetBridgeRequestSchema } from "@pantin/protocol";
import { EXPOSURE_HEADER } from "../domain/bus-upgrade-rules.ts";
import { parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route, type RouteContext } from "./route-context.ts";

// The PLC bridge routes (ADR 0050 point 5).

// A process is never started or stopped from the internet (ADR 0046 point 7).
function refuseExposedChange(context: RouteContext): void {
  // Any value refuses, as for the tag bus: a repeated header arrives joined
  // ("cloudflare, x") and must not slip through.
  if (context.request.headers[EXPOSURE_HEADER] !== undefined) {
    throw new ApiError(
      "invalid_request",
      "The PLC bridge cannot be started or stopped through an internet exposure. Use the local viewer.",
      403,
    );
  }
}

const BRIDGE = ["pantins", ":pantinId", "bridge"];

export const BRIDGE_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: BRIDGE,
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      // 404 for an unknown Pantin, and loads it, as every Pantin route does.
      await context.service.getPantin(pantinId);
      sendJson(context.response, 200, context.bridge.status(pantinId));
    },
  },
  {
    method: "PUT",
    pattern: BRIDGE,
    handle: async (context) => {
      refuseExposedChange(context);
      const pantinId = pantinIdOf(context);
      await context.service.getPantin(pantinId);
      const body = await readJsonBody(context.request);
      const request = parseWithSchema(SetBridgeRequestSchema, body, "The bridge request");
      const status = request.running
        ? await context.bridge.start(pantinId, request)
        : context.bridge.stop(pantinId);
      sendJson(context.response, 200, status);
    },
  },
];
