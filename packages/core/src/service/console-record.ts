import type { ConsoleEvent, PantinId } from "@pantin/protocol";
import { type BridgeLogLevel, describePlcLinkEvent } from "../domain/bridge-log-lines.ts";
import { appendConsoleEvent, type ConsoleBuffer, consoleStamp } from "../domain/console-buffer.ts";

// Recording into the console of an open Pantin (ADR 0031): the only place that
// reads the wall clock for it. Structural types, so that open-pantins.ts can
// use it too without a cycle.

// Returns true when the last event started a new entry, false when it folded
// into an earlier one.
export function recordConsoleEvents(
  context: { wallClock: () => Date },
  openPantin: { console: ConsoleBuffer; stepCount: number },
  events: readonly ConsoleEvent[],
): boolean {
  let startedEntry = false;
  for (const event of events) {
    const stamp = consoleStamp(context.wallClock, openPantin.stepCount);
    openPantin.console = appendConsoleEvent(openPantin.console, event, stamp);
    startedEntry = openPantin.console.entries.at(-1)?.count === 1;
  }
  return startedEntry;
}

// Writes a core line to the Pantin's bridge log; nothing when its bridge is not supervised.
export type BridgeCoreLineWriter = (
  pantinId: PantinId,
  level: BridgeLogLevel,
  text: string,
) => void;

// Records the events of the PLC link in the console, and also in the bridge
// log of that Pantin (ADR 0054, amendment of 2026-10-18): the log file shows
// them at their level, which the bridge could not do by echoing the console.
export function recordPlcLinkEvents(
  context: {
    wallClock: () => Date;
    writeBridgeCoreLine: BridgeCoreLineWriter;
  },
  pantinId: PantinId,
  openPantin: { console: ConsoleBuffer; stepCount: number },
  events: readonly ConsoleEvent[],
): void {
  recordConsoleEvents(context, openPantin, events);
  for (const event of events) {
    const line = describePlcLinkEvent(event);
    if (line !== undefined) {
      context.writeBridgeCoreLine(pantinId, line.level, line.text);
    }
  }
}
