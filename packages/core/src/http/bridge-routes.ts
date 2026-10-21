import { type BridgeListResponse, TRANSPORT_KINDS, TransportKindSchema } from "@pantin/protocol";
import { parseBridgeCommand } from "../domain/bridge-kinds.ts";
import { EXPOSURE_HEADER } from "../domain/bus-upgrade-rules.ts";
import { ApiError } from "../errors.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson, sendText } from "./responses.ts";
import { pantinIdOf, type Route, type RouteContext } from "./route-context.ts";

// The PLC bridge routes (ADR 0050 point 5, ADR 0065 point 7): one bridge per (Pantin,
// transport kind). Allowed through the Cloudflare exposure since the 2026-10-16
// amendment of ADR 0050, behind Cloudflare Access; only the tag bus stays closed there
// (ADR 0046 point 7). The OPC UA start is limited there to loopback targets, without
// passwords or trust (ADR 0065 point 8): its check reads `viaExposure`.

const BRIDGES = ["pantins", ":pantinId", "bridges"];
const BRIDGE = [...BRIDGES, ":kind"];

// An unknown kind is a 404, like an unknown Pantin: the URL names nothing.
function bridgeKindOf(context: RouteContext) {
  const parsed = TransportKindSchema.safeParse(context.parameters.kind);
  if (!parsed.success) {
    throw new ApiError(
      "not_found",
      `Unknown bridge "${context.parameters.kind}". The known ones are: ${TRANSPORT_KINDS.join(", ")}.`,
    );
  }
  return parsed.data;
}

export const BRIDGE_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: BRIDGES,
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      // 404 for an unknown Pantin, and loads it, as every Pantin route does.
      await context.service.getPantin(pantinId);
      const answer: BridgeListResponse = { bridges: context.bridge.statuses(pantinId) };
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "GET",
    pattern: [...BRIDGE, "log"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const kind = bridgeKindOf(context);
      await context.service.getPantin(pantinId);
      const text = await context.bridge.readLog(pantinId, kind);
      const fileName =
        context.query.get("download") === "1" ? `${pantinId}-bridge-${kind}.log` : undefined;
      sendText(context.response, text, fileName);
    },
  },
  {
    method: "PUT",
    pattern: BRIDGE,
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const kind = bridgeKindOf(context);
      await context.service.getPantin(pantinId);
      const viaExposure = context.request.headers[EXPOSURE_HEADER] !== undefined;
      const command = parseBridgeCommand(kind, await readJsonBody(context.request), viaExposure);
      const status = command.running
        ? await context.bridge.start(pantinId, command.start)
        : context.bridge.stop(pantinId, kind);
      sendJson(context.response, 200, status);
    },
  },
];
