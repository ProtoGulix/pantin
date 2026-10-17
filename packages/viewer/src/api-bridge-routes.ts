import {
  type BridgeStatus,
  BridgeStatusSchema,
  type SetBridgeRequest,
  SetBridgeRequestSchema,
} from "@pantin/protocol";
import {
  type FetchFunction,
  failureFromResponse,
  jsonRequest,
  pantinUrl,
  type SendJson,
  sendRequest,
  validInputOrThrow,
} from "./api-transport.ts";

// The PLC bridge routes of the API client (ADR 0050 point 5). Every answer is
// the bridge status after the call.

export interface BridgeRoutes {
  getBridge(pantinId: string): Promise<BridgeStatus>;
  // Start with a network, or stop. Starting answers `starting`; the final state
  // arrives on the pose stream.
  setBridge(pantinId: string, request: SetBridgeRequest): Promise<BridgeStatus>;
  // The bridge log file as text, empty while there is none (ADR 0054 point 4).
  getBridgeLog(pantinId: string): Promise<string>;
}

/** The log as a download (ADR 0054 point 4): the browser saves it under the core's file name. */
export function bridgeLogDownloadUrl(pantinId: string): string {
  return pantinUrl(pantinId, "/bridge/log?download=1");
}

export function bridgeRoutes(send: SendJson, fetchFunction: FetchFunction): BridgeRoutes {
  return {
    getBridge: (pantinId) =>
      send(pantinUrl(pantinId, "/bridge"), jsonRequest("GET"), BridgeStatusSchema),
    setBridge: async (pantinId, request) => {
      const checked = validInputOrThrow(SetBridgeRequestSchema, request);
      return send(pantinUrl(pantinId, "/bridge"), jsonRequest("PUT", checked), BridgeStatusSchema);
    },
    // Plain text, not JSON: only the error answers are validated.
    getBridgeLog: async (pantinId) => {
      const response = await sendRequest(fetchFunction, pantinUrl(pantinId, "/bridge/log"), {
        method: "GET",
      });
      if (!response.ok) {
        throw await failureFromResponse(response);
      }
      return response.text();
    },
  };
}
