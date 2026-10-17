import type { PantinApiClient } from "../api-client.ts";
import {
  CLOSED_JOURNAL,
  type JournalModel,
  type JournalView,
  journalViewOf,
} from "../bridge/bridge-journal.ts";
import type { JournalLevel } from "../bridge/bridge-log-parser.ts";
import { createTranslator } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the window changes in the viewer store, named structurally: the store
// imports this file, so it cannot be imported back.
interface JournalTarget {
  state: ViewerState;
  journalModel: JournalModel;
  journalShownFor: JournalInputs | null;
  ports: {
    api: Pick<PantinApiClient, "getBridgeLog">;
    showBridgeJournal(view: JournalView | null): void;
  };
}

// What the window was last drawn from. The model is replaced, never changed in
// place, so the same three values mean the same view.
export interface JournalInputs {
  model: JournalModel;
  pantinId: string | null;
  language: ViewerState["language"];
}

// The bridge log window of the open Pantin (ADR 0054 point 5). The file is read
// on opening and again on each bridge status of the stream while the window is
// open, one read at a time: a status that arrives during a read asks for one more.

function setJournalModel(store: JournalTarget, next: JournalModel): void {
  store.journalModel = next;
  showJournal(store);
}

function sameInputs(shown: JournalInputs | null, next: JournalInputs): boolean {
  return (
    shown !== null &&
    shown.model === next.model &&
    shown.pantinId === next.pantinId &&
    shown.language === next.language
  );
}

/**
 * The window shows the model in place; the store also calls it after every update.
 * Nothing is done when the inputs did not change: building the view reads the whole
 * file (up to 1 MB), and the store updates many times a second.
 */
export function showJournal(store: JournalTarget): void {
  const inputs: JournalInputs = {
    model: store.journalModel,
    pantinId: store.state.openPantin?.id ?? null,
    language: store.state.language,
  };
  if (sameInputs(store.journalShownFor, inputs)) {
    return;
  }
  store.journalShownFor = inputs;
  const translate = createTranslator(inputs.language);
  store.ports.showBridgeJournal(journalViewOf(inputs.model, inputs.pantinId, translate));
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
  setJournalModel(store, {
    ...CLOSED_JOURNAL,
    hiddenLevels: store.journalModel.hiddenLevels,
    open: true,
  });
  void readJournal(store);
}

export function closeJournal(store: JournalTarget): void {
  // The filters outlive the window, like the console's.
  setJournalModel(store, { ...CLOSED_JOURNAL, hiddenLevels: store.journalModel.hiddenLevels });
}

export function toggleJournalLevel(store: JournalTarget, level: JournalLevel): void {
  const hiddenLevels = new Set(store.journalModel.hiddenLevels);
  if (!hiddenLevels.delete(level)) {
    hiddenLevels.add(level);
  }
  setJournalModel(store, { ...store.journalModel, hiddenLevels });
}

/** A bridge status reached the viewer: the file has probably grown. */
export function refreshJournalOnStatus(store: JournalTarget): void {
  void readJournal(store);
}
