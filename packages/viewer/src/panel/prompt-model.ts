import type { Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";

// The inline confirmation line (never window.confirm): closing with unsaved
// changes, or deleting a body or a joint.

export type PromptAction =
  | "saveAndClose"
  | "discardAndClose"
  | "cancelClose"
  | "confirmDelete"
  | "cancelDelete";

export interface PromptView {
  text: string;
  // Buttons wait while a request runs, so a choice is never sent twice.
  enabled: boolean;
  actions: { action: PromptAction; label: string; primary: boolean }[];
}

function deletePrompt(text: string, state: ViewerState, t: Translate): PromptView {
  return {
    text,
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
