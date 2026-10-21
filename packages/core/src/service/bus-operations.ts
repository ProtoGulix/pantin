import type { ConsoleEvent, PantinId, TransportKind } from "@pantin/protocol";
import type { PlcModuleState } from "../domain/bridge-status.ts";
import type { FeedSource } from "../domain/bus-feed.ts";
import { readConsoleAfter } from "../domain/console-buffer.ts";
import {
  bridgeEvent,
  type ConnectionLossReason,
  pausedWithBridgeEvent,
  plcModuleEvent,
} from "../domain/console-events.ts";
import { describeTags } from "../domain/tags.ts";
import { toClockState } from "./clock-operations.ts";
import { recordPlcLinkEvents } from "./console-record.ts";
import { alignIo } from "./io-alignment.ts";
import { readIo } from "./io-operations.ts";
import { mappingIdOfOpenPantin } from "./io-projection-ids.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";
import { syncTagStates, zeroBitCommands } from "./tag-operations.ts";

// What the tag bus needs of the service (ADR 0045 points 4, 11 and 12): a
// synchronous view for the tick, and the bridge's comings and goings.

// Sync, for the simulation tick: only a Pantin already loaded.
function peekFeedSource(context: ServiceContext, pantinId: PantinId): FeedSource | undefined {
  const openPantin = context.loadedPantins.get(pantinId);
  if (openPantin === undefined) {
    return undefined;
  }
  // A rename made since the last read changes the mappingId the tick reports.
  alignIo(openPantin);
  return {
    stepCount: openPantin.stepCount,
    document: openPantin.document,
    mappingId: (transport) => mappingIdOfOpenPantin(openPantin, transport),
    resetCount: openPantin.resetCount,
    consoleId: openPantin.console.id,
    consoleLastSequence: openPantin.console.lastSequence,
    readConsole: (after) => readConsoleAfter(openPantin.console, after, openPantin.verbose).entries,
    clock: toClockState(openPantin),
    tags: () => {
      syncTagStates(openPantin);
      return describeTags(openPantin.document, openPantin);
    },
  };
}

// The bridge's bus connection opened (ADR 0045 points 11 and 12). A Pantin
// that is already paused warns at once, as a pause with a bridge would.
async function bridgeConnected(
  context: ServiceContext,
  pantinId: PantinId,
  transport: TransportKind,
): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.bridgeConnected = true;
  openPantin.connectedPlcTransports.add(transport);
  context.onBridgeActivity(pantinId);
  const events: ConsoleEvent[] = [bridgeEvent({ connected: true })];
  if (!openPantin.clock.running) {
    events.push(pausedWithBridgeEvent());
  }
  recordPlcLinkEvents(context, pantinId, transport, openPantin, events);
}

// The bridge's bus connection closed or missed its pongs: the PLC is gone, so the bit
// commands mapped on that transport's modules reset (ADR 0065 point 6); the other
// transport's bridge, if any, is not concerned.
async function bridgeDisconnected(
  context: ServiceContext,
  pantinId: PantinId,
  transport: TransportKind,
  reason: ConnectionLossReason,
  lost: { tagsToZero: readonly string[]; moduleKeys: readonly string[] },
): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.connectedPlcTransports.delete(transport);
  openPantin.bridgeConnected = openPantin.connectedPlcTransports.size > 0;
  for (const key of lost.moduleKeys) {
    openPantin.plcModules.delete(key);
  }
  const { tagsToZero } = lost;
  zeroBitCommands(openPantin, tagsToZero);
  recordPlcLinkEvents(context, pantinId, transport, openPantin, [
    bridgeEvent({ connected: false, reason }),
  ]);
  context.onBridgeActivity(pantinId);
}

// One module of the PLC connected or lost its connection (`plc_status`).
async function plcModuleStatus(
  context: ServiceContext,
  pantinId: PantinId,
  transport: TransportKind,
  module: string,
  status: PlcModuleState,
  tagsToZero: readonly string[],
): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.plcModules.set(module, status);
  if (!status.connected) {
    zeroBitCommands(openPantin, tagsToZero);
  }
  recordPlcLinkEvents(context, pantinId, transport, openPantin, [plcModuleEvent(module, status)]);
  context.onBridgeActivity(pantinId);
}

export function busOperations(context: ServiceContext) {
  return {
    // The mapping the bridge reads at start-up and the core reads at hello.
    readIo: (pantinId: PantinId, transport?: TransportKind) => readIo(context, pantinId, transport),
    peekFeedSource: (pantinId: PantinId) => peekFeedSource(context, pantinId),
    bridgeConnected: (pantinId: PantinId, transport: TransportKind) =>
      bridgeConnected(context, pantinId, transport),
    bridgeDisconnected: (
      pantinId: PantinId,
      transport: TransportKind,
      reason: ConnectionLossReason,
      lost: { tagsToZero: readonly string[]; moduleKeys: readonly string[] },
    ) => bridgeDisconnected(context, pantinId, transport, reason, lost),
    plcModuleStatus: (
      pantinId: PantinId,
      transport: TransportKind,
      module: string,
      status: PlcModuleState,
      tagsToZero: readonly string[],
    ) => plcModuleStatus(context, pantinId, transport, module, status, tagsToZero),
  };
}
