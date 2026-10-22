import { SYMBOL_FILE_MAX_BYTES } from "@pantin/protocol";
import type { SymbolImportIntents } from "../io/symbol-import-intents.ts";
import {
  CLOSED_SYMBOL_IMPORT,
  type SymbolImportState,
  symbolImportReady,
  withRowToggled,
  withSymbolPicked,
} from "../io/symbol-import-state.ts";
import { describeFailure, errorMessage, type PanelMessage } from "../messages.ts";
import { applyModuleProposal } from "./io-module-proposal.ts";
import { applyChecked } from "./io-symbol-apply.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Importing PLC symbols from the I/O view (ADR 0064 point 14). The core reads the file and
// proposes; nothing changes until Apply, which sends exactly what the user checked. The
// apply route records an unsaved edit like any other I/O edit.

const MEBIBYTE = 1024 * 1024;

function show(store: ViewerStore, symbolImport: SymbolImportState): void {
  store.update({ ...store.state, symbolImport });
}

function tooLarge(file: File): PanelMessage {
  return errorMessage("symbols.tooLarge", {
    name: file.name,
    limit: SYMBOL_FILE_MAX_BYTES / MEBIBYTE,
  });
}

async function openPreview(store: ViewerStore, file: File): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  if (file.size > SYMBOL_FILE_MAX_BYTES) {
    show(store, { status: "failed", fileName: file.name, message: tooLarge(file) });
    return;
  }
  show(store, { status: "loading", fileName: file.name });
  try {
    const preview = await store.ports.api.previewIoSymbols(open.id, file);
    // Cancelled while the core was reading: the answer is dropped.
    if (store.state.symbolImport.status === "loading") {
      show(store, symbolImportReady(file.name, preview));
    }
  } catch (error) {
    if (store.state.symbolImport.status === "loading") {
      show(store, { status: "failed", fileName: file.name, message: describeFailure(error) });
    }
  }
}

export function symbolImportIntents(store: ViewerStore): SymbolImportIntents {
  return {
    importIoSymbols: (file) => void openPreview(store, file),
    toggleSymbolRow: (rowKey) => show(store, withRowToggled(store.state.symbolImport, rowKey)),
    pickSymbol: (rowKey, reference) =>
      show(store, withSymbolPicked(store.state.symbolImport, rowKey, reference)),
    applySymbolImport: () => void applyChecked(store),
    applyModuleProposal: (moduleKey) => void applyModuleProposal(store, moduleKey),
    closeSymbolImport: () => show(store, CLOSED_SYMBOL_IMPORT),
  };
}
