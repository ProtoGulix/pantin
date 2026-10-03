import type { Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { assemblyDeletionDetails } from "./assembly-deletion-details.ts";

// The inline confirmation line (never window.confirm): closing with unsaved
// changes, or deleting a body, a joint or an assembly with its contents.

export type PromptAction =
  | "saveAndClose"
  | "discardAndClose"
  | "cancelClose"
  | "confirmDelete"
  | "cancelDelete"
  | "confirmReplaceFeed"
  | "cancelReplaceFeed";

export interface PromptView {
  text: string;
  // Lines under the question, rendered as a list (what a deletion removes).
  details?: string[];
  // Buttons wait while a request runs, so a choice is never sent twice.
  enabled: boolean;
  actions: { action: PromptAction; label: string; primary: boolean }[];
}

function deletePrompt(
  text: string,
  state: ViewerState,
  t: Translate,
  details?: string[],
): PromptView {
  return {
    text,
    ...(details === undefined ? {} : { details }),
    enabled: state.pendingRequestCount === 0,
    actions: [
      { action: "confirmDelete", label: t("prompt.delete.confirm"), primary: true },
      { action: "cancelDelete", label: t("prompt.delete.cancel"), primary: false },
    ],
  };
}

export function buildPromptView(state: ViewerState, t: Translate): PromptView | null {
  const open = state.openPantin;
  if (open === null) {
    return null;
  }
  if (state.closePrompt) {
    return {
      text: t("prompt.close.text", { name: open.document.name }),
      enabled: state.pendingRequestCount === 0,
      actions: [
        { action: "saveAndClose", label: t("prompt.close.save"), primary: true },
        { action: "discardAndClose", label: t("prompt.close.discard"), primary: false },
        { action: "cancelClose", label: t("prompt.close.cancel"), primary: false },
      ],
    };
  }
  const replacement = state.pendingFeedReplacement;
  if (replacement !== null) {
    const { actuatorName, fromDrive, toDrive } = replacement.replaced;
    return {
      text: t("prompt.replaceFeed.text", {
        actuator: actuatorName,
        from: fromDrive,
        to: toDrive,
      }),
      enabled: state.pendingRequestCount === 0,
      actions: [
        { action: "confirmReplaceFeed", label: t("prompt.replaceFeed.confirm"), primary: true },
        { action: "cancelReplaceFeed", label: t("prompt.replaceFeed.cancel"), primary: false },
      ],
    };
  }
  const assembly = state.pendingDeleteAssembly;
  if (assembly !== null) {
    // An assembly that is gone (a discard, another edit) leaves nothing to confirm.
    if (!open.document.assemblies.some(({ key }) => key === assembly.key)) {
      return null;
    }
    const text = t("prompt.deleteAssembly.text", { name: assembly.contents.assembly.name });
    return deletePrompt(text, state, t, assemblyDeletionDetails(assembly.contents, t));
  }
  const joint = open.document.joints.find(
    (candidate) => candidate.id === state.pendingDeleteJointId,
  );
  if (joint !== undefined) {
    return deletePrompt(t("prompt.deleteJoint.text", { name: joint.name }), state, t);
  }
  const body = open.document.bodies.find((candidate) => candidate.id === state.pendingDeleteBodyId);
  if (body === undefined) {
    return null;
  }
  return deletePrompt(t("prompt.delete.text", { name: body.name }), state, t);
}
