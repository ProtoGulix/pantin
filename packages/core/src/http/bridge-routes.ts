import { SetBridgeRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// The PLC bridge routes (ADR 0050 point 5). Allowed through the Cloudflare
// exposure since the 2026-10-16 amendment of ADR 0050, behind Cloudflare
// Access; only the tag bus stays closed there (ADR 0046 point 7).

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
