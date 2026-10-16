import type { BridgeFailure, PantinId } from "@pantin/protocol";
import { bridgeFailedEvent } from "../domain/console-events.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// What the bridge supervisor needs of the service (ADR 0050): the bus side of
// a bridge status, read synchronously, and the console line of a failure.

export type BridgeBusFacts = {
  bridgeConnected: boolean;
  plcConnectedModules: ReadonlySet<string>;
};

export function bridgeOperations(context: ServiceContext) {
  return {
    // Sync, for a status built at any time: only a Pantin already loaded can
    // have a bridge on the bus.
    peekBridgeBusFacts: (pantinId: PantinId): BridgeBusFacts => {
      const openPantin = context.loadedPantins.get(pantinId);
      return {
        bridgeConnected: openPantin?.bridgeConnected ?? false,
        plcConnectedModules: openPantin?.plcConnectedModules ?? new Set(),
      };
    },
    recordBridgeFailure: async (pantinId: PantinId, failure: BridgeFailure): Promise<void> => {
      const openPantin = await loadPantin(context, pantinId);
      recordConsoleEvents(context, openPantin, [bridgeFailedEvent(failure)]);
    },
  };
}
