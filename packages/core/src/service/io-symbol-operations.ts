import type {
  ApplyIoVariablesRequest,
  ApplyIoVariablesResponse,
  PantinId,
  SymbolImportPreview,
} from "@pantin/protocol";
import { ioTagsOf } from "../domain/io-evaluation.ts";
import { applyVariableAssignments } from "../domain/io-variable-edits.ts";
import { previewSymbolImport } from "../domain/symbol-preview.ts";
import { alignIo } from "./io-alignment.ts";
import { editIoWithOutcome, refuseUneditable, requireMapping } from "./io-operations.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// Importing PLC variables (ADR 0064 point 13): a preview that reads a symbol file and
// changes nothing, then an apply that sets the variables of many channels in one edit.

export function ioSymbolOperations(context: ServiceContext) {
  return {
    // The symbols exist for this call only: nothing is stored (ADR 0064 point 10).
    previewIoSymbols: async (
      pantinId: PantinId,
      text: string,
      formatId: string | undefined,
    ): Promise<SymbolImportPreview> => {
      const openPantin = await loadPantin(context, pantinId);
      refuseUneditable(openPantin);
      alignIo(openPantin);
      const mapping = requireMapping(openPantin);
      return previewSymbolImport(text, formatId, mapping, ioTagsOf(openPantin.document));
    },
    // One edit for the whole batch: the mappingId changes once, so a running bridge
    // restarts once.
    applyIoVariables: async (
      pantinId: PantinId,
      request: ApplyIoVariablesRequest,
    ): Promise<ApplyIoVariablesResponse> => {
      const { answer, outcome } = await editIoWithOutcome(context, pantinId, (open) => {
        const { document, applied, skipped } = applyVariableAssignments(
          requireMapping(open),
          request.assignments,
        );
        return { document, outcome: { applied, skipped } };
      });
      return { ...answer, ...outcome };
    },
  };
}
