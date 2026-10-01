import type { ConsoleEvent } from "@pantin/protocol";
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
