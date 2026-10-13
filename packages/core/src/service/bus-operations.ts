import type { ConsoleEvent, PantinId } from "@pantin/protocol";
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
import { recordConsoleEvents } from "./console-record.ts";
import { readIo } from "./io-operations.ts";
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
  return {
    stepCount: openPantin.stepCount,
    document: openPantin.document,
    resetCount: openPantin.resetCount,
    consoleId: openPantin.console.id,
    consoleLastSequence: openPantin.console.lastSequence,
    readConsole: (after) => readConsoleAfter(openPantin.console, after).entries,
    clock: toClockState(openPantin),
    tags: () => {
      syncTagStates(openPantin);
      return describeTags(openPantin.document, openPantin);
    },
  };
}

// The bridge's bus connection opened (ADR 0045 points 11 and 12). A Pantin
// that is already paused warns at once, as a pause with a bridge would.
async function bridgeConnected(context: ServiceContext, pantinId: PantinId): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.bridgeConnected = true;
  const events: ConsoleEvent[] = [bridgeEvent({ connected: true })];
  if (!openPantin.clock.running) {
    events.push(pausedWithBridgeEvent());
  }
  recordConsoleEvents(context, openPantin, events);
}

// The bridge's bus connection closed or missed its pongs: the PLC is gone, so
// the bit commands mapped on any module reset.
async function bridgeDisconnected(
  context: ServiceContext,
  pantinId: PantinId,
  reason: ConnectionLossReason,
  tagsToZero: readonly string[],
): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.bridgeConnected = false;
  zeroBitCommands(openPantin, tagsToZero);
  recordConsoleEvents(context, openPantin, [bridgeEvent({ connected: false, reason })]);
}

// One module of the PLC connected or lost its connection (`plc_status`).
async function plcModuleStatus(
  context: ServiceContext,
  pantinId: PantinId,
  module: string,
  status: { connected: true } | { connected: false; reason: ConnectionLossReason },
  tagsToZero: readonly string[],
): Promise<void> {
  const openPantin = await loadPantin(context, pantinId);
  if (!status.connected) {
    zeroBitCommands(openPantin, tagsToZero);
  }
  recordConsoleEvents(context, openPantin, [plcModuleEvent(module, status)]);
}

export function busOperations(context: ServiceContext) {
  return {
    // The mapping the bridge reads at start-up and the core reads at hello.
    readIo: (pantinId: PantinId) => readIo(context, pantinId),
    peekFeedSource: (pantinId: PantinId) => peekFeedSource(context, pantinId),
    bridgeConnected: (pantinId: PantinId) => bridgeConnected(context, pantinId),
    bridgeDisconnected: (
      pantinId: PantinId,
      reason: ConnectionLossReason,
      tagsToZero: readonly string[],
    ) => bridgeDisconnected(context, pantinId, reason, tagsToZero),
    plcModuleStatus: (
      pantinId: PantinId,
      module: string,
      status: { connected: true } | { connected: false; reason: ConnectionLossReason },
      tagsToZero: readonly string[],
    ) => plcModuleStatus(context, pantinId, module, status, tagsToZero),
  };
}
