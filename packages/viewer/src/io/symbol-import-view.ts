import type { SkippedAssignment } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import type { PanelMessage } from "../messages.ts";
import { buildAssignments } from "./symbol-import-rows.ts";
import { readySections, type SymbolSectionView } from "./symbol-import-rows-view.ts";
import { CLOSED_SYMBOL_IMPORT, type SymbolImportState } from "./symbol-import-state.ts";
import { type ModuleProposalsView, moduleProposalsViewOf } from "./symbol-module-proposals-view.ts";

// The PLC symbol import dialog as plain data (ADR 0064 point 14): every text is written
// here, in words, so that colour is never the only cue. The viewer matches nothing.

export type {
  SymbolPickerView,
  SymbolRowView,
  SymbolSectionView,
} from "./symbol-import-rows-view.ts";

export interface SymbolImportView {
  // The state this view was built from: the dialog redraws only when it changes.
  source: SymbolImportState;
  visible: boolean;
  status: SymbolImportState["status"];
  title: string;
  closeLabel: string;
  fileLine: string;
  // Loading text, or the failure with what to do about it.
  statusText: string;
  detail: string | null;
  infoLines: readonly string[];
  summary: string;
  sections: readonly SymbolSectionView[];
  // Proposals for the OPC UA modules, apart from the variables (ADR 0065 point 12).
  moduleProposals: ModuleProposalsView | null;
  applyLabel: string;
  applyEnabled: boolean;
  cancelLabel: string;
  skippedHeading: string;
  skippedLines: readonly string[];
}

const HIDDEN_SYMBOL_IMPORT: SymbolImportView = {
  source: CLOSED_SYMBOL_IMPORT,
  visible: false,
  status: "closed",
  title: "",
  closeLabel: "",
  fileLine: "",
  statusText: "",
  detail: null,
  infoLines: [],
  summary: "",
  sections: [],
  moduleProposals: null,
  applyLabel: "",
  applyEnabled: false,
  cancelLabel: "",
  skippedHeading: "",
  skippedLines: [],
};

function infoLinesOf(
  state: Extract<SymbolImportState, { status: "ready" }>,
  translate: Translate,
): string[] {
  const { preview } = state;
  const project =
    preview.project === null
      ? []
      : [
          translate("symbols.project", {
            name: preview.project.name,
            device: preview.project.deviceName,
            application: preview.project.applicationName,
          }),
        ];
  const readerWarnings = preview.warnings.map((warning) =>
    translate("symbols.readerWarning", { text: warning }),
  );
  return [
    translate("symbols.format", { format: preview.format, count: preview.symbolCount }),
    ...project,
    ...readerWarnings,
  ];
}

function skippedLine(skipped: SkippedAssignment, translate: Translate): string {
  return translate("symbols.skipped.line", {
    module: skipped.module,
    tag: skipped.tag,
    variable: skipped.variable,
    reason: skipped.reason,
  });
}

function messageTexts(message: PanelMessage, translate: Translate) {
  return {
    text: translate(message.key, message.parameters),
    detail: message.detail,
  };
}

function baseView(state: Exclude<SymbolImportState, { status: "closed" }>, translate: Translate) {
  return {
    ...HIDDEN_SYMBOL_IMPORT,
    source: state,
    visible: true,
    status: state.status,
    title: translate("symbols.title"),
    closeLabel: translate("symbols.cancel"),
    cancelLabel: translate("symbols.cancel"),
    applyLabel: translate("symbols.apply"),
    fileLine: translate("symbols.file", { name: state.fileName }),
  };
}

export function buildSymbolImportView(
  state: SymbolImportState,
  translate: Translate,
): SymbolImportView {
  switch (state.status) {
    case "closed":
      return HIDDEN_SYMBOL_IMPORT;
    case "loading":
      return { ...baseView(state, translate), statusText: translate("symbols.loading") };
    case "failed": {
      const { text, detail } = messageTexts(state.message, translate);
      return {
        ...baseView(state, translate),
        statusText: `${translate("symbols.failed")} ${text}`,
        detail,
      };
    }
    case "done":
      return {
        ...baseView(state, translate),
        cancelLabel: translate("symbols.close"),
        statusText: translate("symbols.done", { count: state.appliedCount }),
        skippedHeading:
          state.skipped.length === 0
            ? ""
            : translate("symbols.skipped.heading", { count: state.skipped.length }),
        skippedLines: state.skipped.map((skipped) => skippedLine(skipped, translate)),
      };
    case "ready": {
      const count = buildAssignments(state.preview, state.checked, state.picks).length;
      const refusal = state.applyError === null ? null : messageTexts(state.applyError, translate);
      return {
        ...baseView(state, translate),
        statusText: refusal === null ? "" : `${translate("symbols.applyFailed")} ${refusal.text}`,
        detail: refusal?.detail ?? null,
        infoLines: infoLinesOf(state, translate),
        summary: translate("symbols.summary", { count }),
        sections: readySections(state, translate),
        moduleProposals: moduleProposalsViewOf(state, translate),
        applyEnabled: count > 0 && !state.applying,
      };
    }
  }
}
