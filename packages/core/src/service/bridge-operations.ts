import type { BridgeFailure, PantinId, TransportKind } from "@pantin/protocol";
import type { BridgeBusFacts } from "../domain/bridge-status.ts";
import {
  bridgeFailedEvent,
  bridgeLogEvent,
  opcuaUnsecuredLanEvent,
} from "../domain/console-events.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// What the bridge supervisor needs of the service (ADR 0050): the bus side of
// a bridge status, read synchronously, and the console line of a failure.

export function bridgeOperations(context: ServiceContext) {
  return {
    // Sync, for a status built at any time: only a Pantin already loaded can
    // have a bridge on the bus. The facts are those of one kind (ADR 0065 point 7); module
    // keys are unique in a Pantin, so the supervisor reads the modules it serves.
    peekBridgeBusFacts: (pantinId: PantinId, kind: TransportKind): BridgeBusFacts => {
      const openPantin = context.loadedPantins.get(pantinId);
      return {
        bridgeConnected: openPantin?.connectedPlcTransports.has(kind) ?? false,
        plcModules: openPantin?.plcModules ?? new Map(),
      };
    },
    recordBridgeFailure: async (pantinId: PantinId, failure: BridgeFailure): Promise<void> => {
      const openPantin = await loadPantin(context, pantinId);
      recordConsoleEvents(context, openPantin, [bridgeFailedEvent(failure)]);
    },
    // ADR 0054 point 4: a warning or error line of the bridge's log.
    recordBridgeLog: async (pantinId: PantinId, message: string): Promise<void> => {
      const openPantin = await loadPantin(context, pantinId);
      recordConsoleEvents(context, openPantin, [bridgeLogEvent(message)]);
    },
    // ADR 0065 point 8: one warning per OPC UA module that reaches a private-network PLC
    // without security.
    recordOpcuaUnsecuredLan: async (pantinId: PantinId, modules: string[]): Promise<void> => {
      const openPantin = await loadPantin(context, pantinId);
      recordConsoleEvents(context, openPantin, modules.map(opcuaUnsecuredLanEvent));
    },
  };
}
