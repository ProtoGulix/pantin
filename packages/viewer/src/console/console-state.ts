import type { ConsoleLevel } from "@pantin/protocol";

// What the viewer remembers of the console panel (ADR 0031 point 5): whether
// it is open (closed at start, never opened by the viewer on its own) and which
// levels are filtered out. The lines read from the core are not here: they
// change several times a second while a source flickers, and a state change
// redraws the whole viewer. The store keeps them and pushes them to the panel
// and the counter in place, as it does for tag values.

export interface ConsoleState {
  open: boolean;
  hiddenLevels: ReadonlySet<ConsoleLevel>;
  // Verbose mode as the core reports it (ADR 0061): trace lines show only while
  // it is on. The viewer's own preference lives in the browser storage.
  verbose: boolean;
}

export const INITIAL_CONSOLE_STATE: ConsoleState = {
  open: false,
  hiddenLevels: new Set(),
  verbose: false,
};

export function withConsoleToggled(state: ConsoleState): ConsoleState {
  return { ...state, open: !state.open };
}

export function withConsoleLevelToggled(state: ConsoleState, level: ConsoleLevel): ConsoleState {
  const hiddenLevels = new Set(state.hiddenLevels);
  if (!hiddenLevels.delete(level)) {
    hiddenLevels.add(level);
  }
  return { ...state, hiddenLevels };
}

export function withConsoleVerbose(state: ConsoleState, verbose: boolean): ConsoleState {
  return state.verbose === verbose ? state : { ...state, verbose };
}

/** The stored verbose preference; anything but "true" is off, as at the first start. */
export function parseStoredVerbose(text: string | null): boolean {
  return text === "true";
}
