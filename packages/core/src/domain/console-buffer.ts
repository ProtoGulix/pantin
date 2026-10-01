import type { ConsoleEntry, ConsoleEvent, ConsoleResponse } from "@pantin/protocol";
import { STEP_SECONDS } from "./fixed-step.ts";

// The console of one open Pantin (ADR 0031 points 1 to 3), as an immutable
// value: runtime state, never saved.

export const CONSOLE_CAPACITY = 1000;

export type ConsoleBuffer = {
  // One random id per console, made when the Pantin is opened: a client that
  // sees it change knows the console it was reading is gone.
  id: string;
  // Oldest first, at most CONSOLE_CAPACITY.
  entries: readonly ConsoleEntry[];
  // Highest sequence given so far: it only grows, even when old entries drop.
  lastSequence: number;
};

// When and where the event happened, both read by the caller at the boundary.
export type ConsoleStamp = { wallTime: string; simulationTime: number };

export function emptyConsole(id: string): ConsoleBuffer {
  return { id, entries: [], lastSequence: 0 };
}

// The wall clock is read by the caller and passed in: this stays pure.
export function consoleStamp(wallClock: () => Date, stepCount: number): ConsoleStamp {
  return { wallTime: wallClock().toISOString(), simulationTime: stepCount * STEP_SECONDS };
}

function isSameSource(entry: ConsoleEntry, event: ConsoleEvent): boolean {
  return JSON.stringify(entry.source) === JSON.stringify(event.source);
}

function isRepeat(entry: ConsoleEntry, event: ConsoleEvent): boolean {
  return (
    entry.code === event.code &&
    isSameSource(entry, event) &&
    JSON.stringify(entry.params) === JSON.stringify(event.params)
  );
}

// Index of the entry the event folds into: the latest one with the same code,
// source and params, looking back only through the trailing run of entries
// from the event's source. An entry from another source stops the search.
function foldTargetIndex(entries: readonly ConsoleEntry[], event: ConsoleEvent): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined || !isSameSource(entry, event)) {
      return -1;
    }
    if (isRepeat(entry, event)) {
      return index;
    }
  }
  return -1;
}

// A repeat folds into its earlier entry: count + 1, the times of the latest
// occurrence, and a new sequence, with the entry moving to the end so that
// order follows sequence and a client reading "after" gets it again.
// `firstSequence` stays, to recognise the line. Searching back through one
// source's trailing run makes a flickering raised, cleared, raised, cleared
// from one drive two entries, not one per change (ADR 0031 point 3).
export function appendConsoleEvent(
  buffer: ConsoleBuffer,
  event: ConsoleEvent,
  stamp: ConsoleStamp,
): ConsoleBuffer {
  const sequence = buffer.lastSequence + 1;
  const targetIndex = foldTargetIndex(buffer.entries, event);
  const target = buffer.entries[targetIndex];
  if (target !== undefined) {
    const folded: ConsoleEntry = { ...target, ...stamp, sequence, count: target.count + 1 };
    const others = buffer.entries.filter((_, index) => index !== targetIndex);
    return { ...buffer, entries: [...others, folded], lastSequence: sequence };
  }
  // Cast: spreading an event of a union with its entry fields keeps the
  // pairing of `code` and `params`, which TypeScript cannot follow through the spread.
  const entry = { ...event, ...stamp, sequence, firstSequence: sequence, count: 1 } as ConsoleEntry;
  return {
    ...buffer,
    entries: [...buffer.entries, entry].slice(-CONSOLE_CAPACITY),
    lastSequence: sequence,
  };
}

export function readConsoleAfter(buffer: ConsoleBuffer, after: number): ConsoleResponse {
  return {
    consoleId: buffer.id,
    entries: buffer.entries.filter((entry) => entry.sequence > after),
    lastSequence: buffer.lastSequence,
  };
}
