import type { ApplyIoVariablesResponse } from "@pantin/protocol";
import { withMapping } from "../io/io-state.ts";
import { buildAssignments } from "../io/symbol-import-rows.ts";
import { CLOSED_SYMBOL_IMPORT, type SymbolImportState } from "../io/symbol-import-state.ts";
import { describeFailure } from "../messages.ts";
import { withRequestFinished, withRequestStarted } from "../request-count.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { loadIoMapping } from "./io-load.ts";
import { refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Applying the checked rows of the symbol import (ADR 0064 point 14). Two requests, kept
// apart: once the apply succeeded the core has changed the mapping, so the window says
// "done" whatever happens to the refresh that follows.

function show(store: ViewerStore, symbolImport: SymbolImportState): void {
  store.update({ ...store.state, symbolImport });
}

// A cancel during the request closed the window for good: its answers must not reopen it.
function isStillApplying(store: ViewerStore, fileName: string): boolean {
  const { symbolImport } = store.state;
  return (
    symbolImport.status === "ready" && symbolImport.applying && symbolImport.fileName === fileName
  );
}

// The window of this apply says "done"; a window closed meanwhile, even during the refresh
// that follows the apply, stays closed.
function doneState(
  store: ViewerStore,
  fileName: string,
  response: ApplyIoVariablesResponse,
): SymbolImportState {
  const { applied, skipped } = response;
  return isStillApplying(store, fileName)
    ? { status: "done", fileName, appliedCount: applied.length, skipped }
    : CLOSED_SYMBOL_IMPORT;
}

async function refreshAfterApply(
  store: ViewerStore,
  pantinId: string,
  fileName: string,
  response: ApplyIoVariablesResponse,
): Promise<void> {
  try {
    const pantin = await store.ports.api.getPantin(pantinId);
    const finished = withRequestFinished(store.state);
    // Another Pantin was opened meanwhile: the window belonged to the first one.
    if (store.requestedPantinId !== pantin.id) {
      store.update({ ...finished, symbolImport: CLOSED_SYMBOL_IMPORT });
    } else {
      const symbolImport = doneState(store, fileName, response);
      const state = withOpenPantin(finished, pantin);
      const { applied: _applied, skipped: _skipped, ...mapping } = response;
      store.update({ ...state, io: withMapping(state.io, pantin, mapping), symbolImport });
    }
  } catch (error) {
    // Reported the usual way; the mapping is read again so that the view is not stale.
    store.update({
      ...withRequestFinished(store.state),
      symbolImport: doneState(store, fileName, response),
      message: describeFailure(error),
    });
    await loadIoMapping(store);
  }
  await refreshPantinList(store);
}

export async function applyChecked(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const current = store.state.symbolImport;
  if (open === null || current.status !== "ready" || current.applying) {
    return;
  }
  const assignments = buildAssignments(current.preview, current.checked, current.picks);
  if (assignments.length === 0) {
    return;
  }
  // Counted like any edit, so that the menus and shortcuts wait for it.
  store.update({
    ...withRequestStarted(store.state),
    symbolImport: { ...current, applying: true, applyError: null },
  });
  let response: ApplyIoVariablesResponse;
  try {
    response = await store.ports.api.applyIoVariables(open.id, { assignments });
  } catch (error) {
    store.update(withRequestFinished(store.state));
    if (isStillApplying(store, current.fileName)) {
      show(store, { ...current, applying: false, applyError: describeFailure(error) });
    }
    return;
  }
  await refreshAfterApply(store, open.id, current.fileName, response);
}
