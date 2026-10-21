import type { BridgeNetwork, PantinId, TransportKind } from "@pantin/protocol";
import {
  classifyBridgeLine,
  consoleMessageOfBridgeLine,
  describeBridgeTransition,
  shouldReachConsole,
} from "../domain/bridge-log-lines.ts";
import type { BridgeEvent, BridgeMachineState } from "../domain/bridge-state.ts";
import type { BridgeLogFile } from "./bridge-log-file.ts";

// What the supervisor writes to the bridge log file (ADR 0054) and which lines
// it also sends to the Pantin console. Kept apart so that the supervisor stays
// about processes and states.

export type BridgeLogSinks = {
  logFile: BridgeLogFile;
  recordConsole: (pantinId: PantinId, message: string) => Promise<void>;
  reportError: (error: unknown) => void;
};

export function logTransition(
  sinks: BridgeLogSinks,
  at: { pantinId: PantinId; kind: TransportKind },
  change: {
    before: BridgeMachineState;
    after: BridgeMachineState;
    event: BridgeEvent;
    network: BridgeNetwork | null;
  },
): void {
  const entry = describeBridgeTransition(change.before, change.after, change.event, change.network);
  if (entry !== undefined) {
    sinks.logFile.coreEvent(at.pantinId, at.kind, entry.level, entry.text);
  }
}

export function logBridgeLine(
  sinks: BridgeLogSinks,
  at: { pantinId: PantinId; kind: TransportKind },
  line: string,
): void {
  sinks.logFile.bridgeLine(at.pantinId, at.kind, line);
  if (shouldReachConsole(classifyBridgeLine(line))) {
    sinks.recordConsole(at.pantinId, consoleMessageOfBridgeLine(line)).catch(sinks.reportError);
  }
}
