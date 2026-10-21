import type {
  OrphanMeshList,
  PantinDocument,
  PantinResponse,
  RedundantJointsList,
} from "@pantin/protocol";
import { buildReloadQuestion } from "../external-edits/external-edit-model.ts";
import type { PendingGroup } from "../grouping/grouping-model.ts";
import { pluralKey, type Translate } from "../i18n/translate.ts";
import type { PendingDeviceDeletion } from "../pending-device-deletion.ts";
import type { ViewerState } from "../viewer-state.ts";
import { assemblyDeletionDetails } from "./assembly-deletion-details.ts";
import { deviceDeletionQuestion } from "./device-deletion-prompt.ts";
import { orphanCleanupDetails, orphanCleanupPromptText } from "./orphan-cleanup-details.ts";
import type { PromptSection } from "./prompt-section.ts";
import { redundantJointsSections, redundantJointsText } from "./redundant-joints-prompt.ts";

// The inline confirmation line (never window.confirm): closing with unsaved
// changes, or deleting a body, a joint or an assembly with its contents.

export type PromptAction =
  | "saveAndClose"
  | "discardAndClose"
  | "stopBridgeAndClose"
  | "closeKeepingBridge"
  | "cancelClose"
  | "confirmReload"
  | "cancelReload"
  | "confirmDelete"
  | "cancelDelete"
  | "confirmOrphanCleanup"
  | "cancelOrphanCleanup"
  | "confirmReplaceFeed"
  | "cancelReplaceFeed"
  | "confirmGroup"
  | "cancelGroup"
  | "confirmRedundantJoints"
  | "cancelRedundantJoints";

export interface PromptView {
  text: string;
  // Lines under the question, rendered as a list (what a deletion removes).
  details?: string[];
  // Titled lists under the question, each heading carrying its count.
  sections?: PromptSection[];
  // Buttons wait while a request runs, so a choice is never sent twice.
  enabled: boolean;
  // `disabled`: this button waits for the question to be answerable (a name typed).
  actions: { action: PromptAction; label: string; primary: boolean; disabled?: boolean }[];
  // A text field under the question: the name of the group to make.
  textField?: { label: string; value: string; focusKey: string };
  // A box under the question: "Also stop the bridge" when closing with unsaved changes.
  checkbox?: { label: string; checked: boolean };
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

function orphanCleanupPrompt(
  orphans: OrphanMeshList,
  state: ViewerState,
  t: Translate,
): PromptView {
  return {
    text: orphanCleanupPromptText(orphans, state.language),
    details: orphanCleanupDetails(orphans, state.language),
    enabled: state.pendingRequestCount === 0,
    actions: [
      { action: "confirmOrphanCleanup", label: t("prompt.orphanCleanup.confirm"), primary: true },
      { action: "cancelOrphanCleanup", label: t("prompt.orphanCleanup.cancel"), primary: false },
    ],
  };
}

function redundantJointsPrompt(
  list: RedundantJointsList,
  state: ViewerState,
  t: Translate,
): PromptView {
  return {
    text: redundantJointsText(list, state.language, t),
    sections: redundantJointsSections(list, t),
    enabled: state.pendingRequestCount === 0,
    actions: [
      {
        action: "confirmRedundantJoints",
        label: t("prompt.redundantJoints.confirm"),
        primary: true,
      },
      {
        action: "cancelRedundantJoints",
        label: t("prompt.redundantJoints.cancel"),
        primary: false,
      },
    ],
  };
}

// "Grouper…" (ADR 0055 point 12): null when the assembly holding the members
// is gone, since there is nothing left to confirm.
function groupPrompt(
  pending: PendingGroup,
  document: PantinDocument,
  state: ViewerState,
  t: Translate,
): PromptView | null {
  const holder = document.assemblies.find(({ key }) => key === pending.target.assemblyKey);
  if (holder === undefined) {
    return null;
  }
  const count = pending.target.bodies.length + pending.target.assemblies.length;
  return {
    text: t(pluralKey("prompt.group.text", count, state.language), {
      count,
      assembly: holder.name,
    }),
    enabled: state.pendingRequestCount === 0,
    textField: {
      label: t("prompt.group.nameLabel"),
      value: pending.name,
      focusKey: "prompt-group-name",
    },
    actions: [
      {
        action: "confirmGroup",
        label: t("prompt.group.confirm"),
        primary: true,
        disabled: pending.name.trim() === "",
      },
      { action: "cancelGroup", label: t("prompt.group.cancel"), primary: false },
    ],
  };
}

function closePromptView(state: ViewerState, open: PantinResponse, t: Translate): PromptView {
  const enabled = state.pendingRequestCount === 0;
  const cancel = {
    action: "cancelClose",
    label: t("prompt.close.cancel"),
    primary: false,
  } as const;
  if (state.closeBridgeNotice && !open.unsavedChanges) {
    return {
      text: t("prompt.close.bridgeRunning"),
      enabled,
      actions: [
        { action: "stopBridgeAndClose", label: t("prompt.close.stopBridge"), primary: true },
        { action: "closeKeepingBridge", label: t("prompt.close.keepBridge"), primary: false },
        cancel,
      ],
    };
  }
  const unsavedText = t("prompt.close.text", { name: open.document.name });
  return {
    text: state.closeBridgeNotice
      ? `${unsavedText} ${t("prompt.close.bridgeRunning")}`
      : unsavedText,
    enabled,
    ...(state.closeBridgeNotice
      ? { checkbox: { label: t("prompt.close.alsoStopBridge"), checked: state.closeStopsBridge } }
      : {}),
    actions: [
      { action: "saveAndClose", label: t("prompt.close.save"), primary: true },
      { action: "discardAndClose", label: t("prompt.close.discard"), primary: false },
      cancel,
    ],
  };
}

function deviceDeletePrompt(
  document: PantinDocument,
  device: PendingDeviceDeletion,
  state: ViewerState,
  t: Translate,
): PromptView | null {
  const question = deviceDeletionQuestion(document, device, t);
  return question === null ? null : deletePrompt(question.text, state, t, question.details);
}

function reloadPrompt(state: ViewerState, open: PantinResponse, t: Translate): PromptView | null {
  const question = buildReloadQuestion(open, state.pendingReload, t);
  if (question === null) {
    return null;
  }
  return {
    text: question,
    enabled: state.pendingRequestCount === 0,
    actions: [
      { action: "confirmReload", label: t("prompt.reload.confirm"), primary: true },
      { action: "cancelReload", label: t("prompt.reload.cancel"), primary: false },
    ],
  };
}

export function buildPromptView(state: ViewerState, t: Translate): PromptView | null {
  const open = state.openPantin;
  if (open === null) {
    return null;
  }
  if (state.closePrompt) {
    return closePromptView(state, open, t);
  }
  const reload = reloadPrompt(state, open, t);
  if (reload !== null) {
    return reload;
  }
  if (state.pendingGroup !== null) {
    return groupPrompt(state.pendingGroup, open.document, state, t);
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
  if (state.pendingRedundantJoints !== null) {
    return redundantJointsPrompt(state.pendingRedundantJoints, state, t);
  }
  const orphans = state.pendingOrphanCleanup;
  if (orphans !== null) {
    return orphanCleanupPrompt(orphans, state, t);
  }
  if (state.pendingDeleteDevice !== null) {
    return deviceDeletePrompt(open.document, state.pendingDeleteDevice, state, t);
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
