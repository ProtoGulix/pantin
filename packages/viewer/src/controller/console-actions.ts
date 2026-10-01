import type { ConsoleLevel, ConsoleSource } from "@pantin/protocol";
import { clearConsoleLines, mergeConsoleResponse } from "../console/console-list.ts";
import { consoleSourceTarget } from "../console/console-sources.ts";
import { withConsoleLevelToggled, withConsoleToggled } from "../console/console-state.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { selectDevice } from "./diagram-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The Pantin console (ADR 0031): reading what the core logged, and the panel's
// own state. Nothing here opens the panel on its own.

/**
 * Reads the entries after the last sequence the viewer has, from the 250 ms
 * loop, while a Pantin is open. Like the tag read, a failed read changes
 * nothing on screen and the next one retries (a core that went away is already
 * reported by the pose stream). The lines go to the panel in place: a state
 * update would redraw the whole viewer at every fold of a flickering source.
 * An answer is dropped when the Pantin was closed meanwhile, or when the list
 * is no longer at the sequence it was asked from (closed and opened again: the
 * core keeps an open Pantin's console, so the consoleId may be the same).
 */
export async function refreshConsole(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null || store.readingConsole) {
    return;
  }
  const after = store.consoleList.lastSequence;
  store.readingConsole = true;
  const answer = await store.ports.api.getConsole(open.id, after).catch(() => null);
  store.readingConsole = false;
  if (
    answer !== null &&
    store.state.openPantin?.id === open.id &&
    store.consoleList.lastSequence === after
  ) {
    const next = mergeConsoleResponse(store.consoleList, answer);
    if (next !== store.consoleList) {
      store.showConsoleList(next);
    }
  }
}

export function toggleConsole(store: ViewerStore): void {
  store.update({ ...store.state, console: withConsoleToggled(store.state.console) });
}

function toggleConsoleLevel(store: ViewerStore, level: ConsoleLevel): void {
  store.update({ ...store.state, console: withConsoleLevelToggled(store.state.console, level) });
}

export function clearConsole(store: ViewerStore): void {
  store.consoleList = clearConsoleLines(store.consoleList);
  // The panel's own state did not change: redraw it with the list that is now empty.
  store.update(store.state);
}

/** Selects the source of a line, as a click in the diagram or the tree would; gone, it does nothing. */
function selectConsoleSource(store: ViewerStore, source: ConsoleSource): void {
  const open = store.state.openPantin;
  const target = open === null ? null : consoleSourceTarget(open.document, open.id, source);
  if (target?.kind === "device") {
    selectDevice(store, target.device);
  } else if (target?.kind === "node") {
    store.update({ ...withRevealedNode(store.state, target.nodeId), contextMenu: null });
  }
}

export function consoleIntents(store: ViewerStore) {
  return {
    toggleConsole: () => toggleConsole(store),
    toggleConsoleLevel: (level: ConsoleLevel) => toggleConsoleLevel(store, level),
    clearConsole: () => clearConsole(store),
    selectConsoleSource: (source: ConsoleSource) => selectConsoleSource(store, source),
  };
}
