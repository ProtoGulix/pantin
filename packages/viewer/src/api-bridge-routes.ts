import {
  BridgeListResponseSchema,
  type ModbusBridgeStatus,
  ModbusBridgeStatusSchema,
  type OpcuaBridgeStatus,
  OpcuaBridgeStatusSchema,
  type SetModbusBridgeRequest,
  SetModbusBridgeRequestSchema,
  type SetOpcuaBridgeRequest,
  SetOpcuaBridgeRequestSchema,
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
import { modbusStatusOf } from "./bridge/modbus-status.ts";

// The PLC bridge routes of the API client (ADR 0050 point 5, ADR 0065 point 7), for the
// Modbus bridge (get, set, log) and the OPC UA bridge (set; its status arrives on the stream).
// Every answer is the bridge status after the call.

export interface BridgeRoutes {
  getBridge(pantinId: string): Promise<ModbusBridgeStatus>;
  // Start with a network, or stop. Starting answers `starting`; the final state
  // arrives on the pose stream.
  setBridge(pantinId: string, request: SetModbusBridgeRequest): Promise<ModbusBridgeStatus>;
  // Start with targets, passwords and certificates to trust, or stop. The passwords are sent
  // here and nowhere else (ADR 0065 point 9).
  setOpcuaBridge(pantinId: string, request: SetOpcuaBridgeRequest): Promise<OpcuaBridgeStatus>;
  // The bridge log file as text, empty while there is none (ADR 0054 point 4).
  getBridgeLog(pantinId: string): Promise<string>;
}

/** The log as a download (ADR 0054 point 4): the browser saves it under the core's file name. */
export function bridgeLogDownloadUrl(pantinId: string): string {
  return pantinUrl(pantinId, "/bridges/modbus_tcp_slave/log?download=1");
}

export function bridgeRoutes(send: SendJson, fetchFunction: FetchFunction): BridgeRoutes {
  return {
    getBridge: async (pantinId) => {
      const list = await send(
        pantinUrl(pantinId, "/bridges"),
        jsonRequest("GET"),
        BridgeListResponseSchema,
      );
      const modbus = modbusStatusOf(list);
      if (modbus === undefined) {
        throw new Error("The core's bridge list has no Modbus bridge.");
      }
      return modbus;
    },
    setBridge: async (pantinId, request) => {
      const checked = validInputOrThrow(SetModbusBridgeRequestSchema, request);
      return send(
        pantinUrl(pantinId, "/bridges/modbus_tcp_slave"),
        jsonRequest("PUT", checked),
        ModbusBridgeStatusSchema,
      );
    },
    setOpcuaBridge: async (pantinId, request) => {
      const checked = validInputOrThrow(SetOpcuaBridgeRequestSchema, request);
      return send(
        pantinUrl(pantinId, "/bridges/opcua_client"),
        jsonRequest("PUT", checked),
        OpcuaBridgeStatusSchema,
      );
    },
    // Plain text, not JSON: only the error answers are validated.
    getBridgeLog: async (pantinId) => {
      const response = await sendRequest(
        fetchFunction,
        pantinUrl(pantinId, "/bridges/modbus_tcp_slave/log"),
        {
          method: "GET",
        },
      );
      if (!response.ok) {
        throw await failureFromResponse(response);
      }
      return response.text();
    },
  };
}
