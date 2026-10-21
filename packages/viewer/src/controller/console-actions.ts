import type { ConsoleLevel, ConsoleSource } from "@pantin/protocol";
import { consoleExportFileName, consoleExportText } from "../console/console-export.ts";
import {
  type ClientConsole,
  clearConsoleLines,
  mergeConsoleResponse,
} from "../console/console-list.ts";
import { consoleSourceTarget } from "../console/console-sources.ts";
import { withConsoleLevelToggled, withConsoleToggled } from "../console/console-state.ts";
import { buildConsoleView } from "../console/console-view.ts";
import { createTranslator } from "../i18n/translate.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { showCoreVerbose, toggleConsoleVerbose } from "./console-verbose-actions.ts";
import { selectDevice } from "./diagram-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The Pantin console (ADR 0031): reading what the core logged, and the panel's
// own state. Nothing here opens the panel on its own.

/** New console lines reach the panel and the toolbar counter in place, without a redraw. */
function showConsoleList(store: ViewerStore, list: ClientConsole): void {
  store.consoleList = list;
  const { state } = store;
  store.ports.showConsoleLive(
    buildConsoleView(
      state.console,
      list,
      state.openPantin,
      state.language,
      createTranslator(state.language),
    ),
  );
}

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
      showConsoleList(store, next);
    }
    // Another client may have changed verbose mode: show the real state (ADR 0061 point 6).
    showCoreVerbose(store, answer.verbose);
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

/** Offers the lines the panel shows as a text file, in the language of the viewer. */
function exportConsole(store: ViewerStore): void {
  const { state } = store;
  const view = buildConsoleView(
    state.console,
    store.consoleList,
    state.openPantin,
    state.language,
    createTranslator(state.language),
  );
  if (view !== null && state.openPantin !== null && view.canExport) {
    store.ports.saveTextFile(
      consoleExportFileName(state.openPantin.id),
      consoleExportText(view.lines),
    );
  }
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
    toggleConsoleVerbose: () => void toggleConsoleVerbose(store),
    clearConsole: () => clearConsole(store),
    exportConsole: () => exportConsole(store),
    selectConsoleSource: (source: ConsoleSource) => selectConsoleSource(store, source),
  };
}
