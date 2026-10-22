import type { ModuleProposalReason } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import type { SymbolImportState } from "./symbol-import-state.ts";

// The module proposals of the symbol import dialog as plain data (ADR 0065 point 12). A proposal
// is always "to check": the NodeId may use the runtime name, not the device name of the file
// (spike 0012). It carries the word and a warning glyph, never a tint alone.

export interface ModuleProposalView {
  module: string;
  title: string;
  prefixLine: string;
  reasonLine: string;
  // The "to check" remark, a sentence.
  remark: string;
  applyLabel: string;
  applyEnabled: boolean;
}

export interface ModuleProposalsView {
  heading: string;
  errorText: string | null;
  errorDetail: string | null;
  proposals: readonly ModuleProposalView[];
}

const REASON_KEYS = {
  from_project_info: "symbols.moduleProposal.reason.from_project_info",
} as const satisfies Record<ModuleProposalReason, MessageKey>;

export function moduleProposalsViewOf(
  state: Extract<SymbolImportState, { status: "ready" }>,
  translate: Translate,
): ModuleProposalsView | null {
  const { moduleProposals, project } = state.preview;
  if (moduleProposals.length === 0) {
    return null;
  }
  const busy = state.applyingProposal !== null || state.applying;
  const error = state.proposalError;
  return {
    heading: translate("symbols.moduleProposal.heading", { count: moduleProposals.length }),
    errorText:
      error === null
        ? null
        : `${translate("symbols.moduleProposal.refused")} ${translate(error.key, error.parameters)}`,
    errorDetail: error?.detail ?? null,
    proposals: moduleProposals.map((proposal) => ({
      module: proposal.module,
      title: translate("symbols.moduleProposal.title", { key: proposal.module }),
      prefixLine: translate("symbols.moduleProposal.prefix", { value: proposal.nodeIdPrefix }),
      reasonLine: translate(REASON_KEYS[proposal.reason], {
        device: project?.deviceName ?? "",
        application: project?.applicationName ?? "",
      }),
      remark: translate("symbols.moduleProposal.toCheck"),
      applyLabel: translate("symbols.moduleProposal.apply", { key: proposal.module }),
      applyEnabled: !busy,
    })),
  };
}
