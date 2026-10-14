import {
  type BridgeStatus,
  BridgeStatusSchema,
  type SetBridgeRequest,
  SetBridgeRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// The PLC bridge routes of the API client (ADR 0050 point 5). Every answer is
// the bridge status after the call.

export interface BridgeRoutes {
  getBridge(pantinId: string): Promise<BridgeStatus>;
  // Start with a network, or stop. Starting answers `starting`; the final state
  // arrives on the pose stream.
  setBridge(pantinId: string, request: SetBridgeRequest): Promise<BridgeStatus>;
}

export function bridgeRoutes(send: SendJson): BridgeRoutes {
  return {
    getBridge: (pantinId) =>
      send(pantinUrl(pantinId, "/bridge"), jsonRequest("GET"), BridgeStatusSchema),
    setBridge: async (pantinId, request) => {
      const checked = validInputOrThrow(SetBridgeRequestSchema, request);
      return send(pantinUrl(pantinId, "/bridge"), jsonRequest("PUT", checked), BridgeStatusSchema);
    },
  };
}
