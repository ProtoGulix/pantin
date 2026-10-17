import type { PantinApiClient } from "../api-client.ts";
import {
  CLOSED_JOURNAL,
  type JournalModel,
  type JournalView,
  journalViewOf,
} from "../bridge/bridge-journal.ts";
import { createTranslator } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the window changes in the viewer store, named structurally: the store
// imports this file, so it cannot be imported back.
interface JournalTarget {
  state: ViewerState;
  journalModel: JournalModel;
  ports: {
    api: Pick<PantinApiClient, "getBridgeLog">;
    showBridgeJournal(view: JournalView | null): void;
  };
}

// The bridge log window of the open Pantin (ADR 0054 point 5). The file is read
// on opening and again on each bridge status of the stream while the window is
// open, one read at a time: a status that arrives during a read asks for one more.

function setJournalModel(store: JournalTarget, next: JournalModel): void {
  store.journalModel = next;
  showJournal(store);
}

/** The window shows the model in place; the store also calls it after every update. */
export function showJournal(store: JournalTarget): void {
  const translate = createTranslator(store.state.language);
  store.ports.showBridgeJournal(
    journalViewOf(store.journalModel, store.state.openPantin?.id ?? null, translate),
  );
}

function errorTextOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJournal(store: JournalTarget): Promise<void> {
  const pantinId = store.state.openPantin?.id;
  if (pantinId === undefined || !store.journalModel.open) {
    return;
  }
  if (store.journalModel.reading) {
    setJournalModel(store, { ...store.journalModel, stale: true });
    return;
  }
  setJournalModel(store, { ...store.journalModel, reading: true, stale: false });
  let outcome: Pick<JournalModel, "text" | "error">;
  try {
    outcome = { text: await store.ports.api.getBridgeLog(pantinId), error: null };
  } catch (error) {
    // The previous text stays: a failed refresh must not blank what was read.
    outcome = { text: store.journalModel.text, error: errorTextOf(error) };
  }
  // Closed or another Pantin meanwhile: the answer is not for this window.
  if (!store.journalModel.open || store.state.openPantin?.id !== pantinId) {
    return;
  }
  const again = store.journalModel.stale;
  setJournalModel(store, { ...store.journalModel, ...outcome, reading: false, stale: false });
  if (again) {
    await readJournal(store);
  }
}

export function openJournal(store: JournalTarget): void {
  if (store.state.openPantin === null) {
    return;
  }
  setJournalModel(store, { ...CLOSED_JOURNAL, open: true });
  void readJournal(store);
}

export function closeJournal(store: JournalTarget): void {
  setJournalModel(store, CLOSED_JOURNAL);
}

/** A bridge status reached the viewer: the file has probably grown. */
export function refreshJournalOnStatus(store: JournalTarget): void {
  void readJournal(store);
}
