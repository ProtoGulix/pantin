import type { SkippedAssignment, SymbolImportPreview } from "@pantin/protocol";
import type { PanelMessage } from "../messages.ts";
import { defaultCheckedKeys, isApplicable, symbolRowKey } from "./symbol-import-rows.ts";

// The state of the PLC symbol import dialog (ADR 0064 point 14). The preview is the
// core's answer for one file; the user's choices (checked rows, picker choices) live here
// until Apply or Cancel. Nothing is stored anywhere else, the symbols included.

export type SymbolImportState =
  | { status: "closed" }
  | { status: "loading"; fileName: string }
  // The message says what to do: the core's refusal, or the viewer's own.
  | { status: "failed"; fileName: string; message: PanelMessage }
  | {
      status: "ready";
      fileName: string;
      preview: SymbolImportPreview;
      checked: ReadonlySet<string>;
      // Signal key -> reference of the variable chosen in its picker.
      picks: ReadonlyMap<string, string>;
      applying: boolean;
      // The core refused the whole batch: shown in the dialog, the choices stay.
      applyError: PanelMessage | null;
    }
  | {
      status: "done";
      fileName: string;
      appliedCount: number;
      skipped: readonly SkippedAssignment[];
    };

export const CLOSED_SYMBOL_IMPORT: SymbolImportState = { status: "closed" };

export function symbolImportReady(
  fileName: string,
  preview: SymbolImportPreview,
): SymbolImportState {
  return {
    status: "ready",
    fileName,
    preview,
    checked: defaultCheckedKeys(preview),
    picks: new Map(),
    applying: false,
    applyError: null,
  };
}

/** Checks or unchecks a proposal; a row that cannot be applied stays as it is. */
export function withRowToggled(state: SymbolImportState, rowKey: string): SymbolImportState {
  if (state.status !== "ready" || state.applying) {
    return state;
  }
  const row = state.preview.proposals.find((match) => symbolRowKey(match) === rowKey);
  if (row === undefined || !isApplicable(row)) {
    return state;
  }
  const checked = new Set(state.checked);
  if (!checked.delete(rowKey)) {
    checked.add(rowKey);
  }
  return { ...state, checked };
}

/** Chooses a variable for an unmatched signal; an empty reference clears the choice. */
export function withSymbolPicked(
  state: SymbolImportState,
  rowKey: string,
  reference: string,
): SymbolImportState {
  if (state.status !== "ready" || state.applying) {
    return state;
  }
  const picks = new Map(state.picks);
  if (reference === "") {
    picks.delete(rowKey);
  } else {
    picks.set(rowKey, reference);
  }
  return { ...state, picks };
}
