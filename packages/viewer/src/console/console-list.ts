import type { ConsoleEntry, ConsoleResponse } from "@pantin/protocol";

// The viewer's copy of the open Pantin's console (ADR 0031 point 5): the lines
// read so far, merged as the core sends them. Pure, so the folding rules of
// the protocol (console.ts) are tested without a core.

// As many as the core keeps (ADR 0031 point 1, ADR 0061 point 5): more would only be stale.
export const CONSOLE_CLIENT_LIMIT = 1000;

export interface ClientConsole {
  // Null until the first answer; then the console the sequences belong to.
  consoleId: string | null;
  // The `after` of the next read.
  lastSequence: number;
  // "Effacer" (this viewer only): lines whose sequence is not above are hidden.
  clearedUpTo: number;
  // Oldest first, one line per firstSequence.
  entries: readonly ConsoleEntry[];
}

export const EMPTY_CLIENT_CONSOLE: ClientConsole = {
  consoleId: null,
  lastSequence: 0,
  clearedUpTo: 0,
  entries: [],
};

/**
 * Adds what the core answered. A folded entry comes back with a new sequence
 * and the firstSequence it was created with: it replaces its line and moves
 * to the end. Another consoleId means the sequences started over (the core
 * restarted, or the Pantin was closed and opened again): the list is dropped
 * and, with lastSequence at 0, the next read starts from the beginning. The
 * answer's own entries are dropped too, as they may follow an `after` that
 * belonged to the old console.
 */
export function mergeConsoleResponse(
  current: ClientConsole,
  response: ConsoleResponse,
): ClientConsole {
  if (current.consoleId !== null && current.consoleId !== response.consoleId) {
    return { ...EMPTY_CLIENT_CONSOLE, consoleId: response.consoleId };
  }
  if (response.entries.length === 0 && current.consoleId === response.consoleId) {
    return current;
  }
  const replaced = new Set(response.entries.map((entry) => entry.firstSequence));
  const kept = current.entries.filter((entry) => !replaced.has(entry.firstSequence));
  return {
    ...current,
    consoleId: response.consoleId,
    lastSequence: Math.max(current.lastSequence, response.lastSequence),
    entries: withinLimit([...kept, ...response.entries]),
  };
}

/**
 * The core's eviction rule (ADR 0061 point 5): the oldest trace line goes
 * first, and an older error or warning only when no trace line is left.
 */
function withinLimit(entries: readonly ConsoleEntry[]): readonly ConsoleEntry[] {
  let excess = entries.length - CONSOLE_CLIENT_LIMIT;
  if (excess <= 0) {
    return entries;
  }
  const evicted = new Set<ConsoleEntry>();
  for (const entry of entries) {
    if (excess > 0 && entry.level === "trace") {
      evicted.add(entry);
      excess -= 1;
    }
  }
  return entries.filter((entry) => !evicted.has(entry)).slice(excess > 0 ? excess : 0);
}

/** "Effacer": hides every line read so far; a later occurrence shows again. */
export function clearConsoleLines(current: ClientConsole): ClientConsole {
  return { ...current, clearedUpTo: current.lastSequence };
}

/** The lines still shown: those that came (or came back) after the clear point. */
export function linesAfterClear(list: ClientConsole): readonly ConsoleEntry[] {
  return list.entries.filter((entry) => entry.sequence > list.clearedUpTo);
}
