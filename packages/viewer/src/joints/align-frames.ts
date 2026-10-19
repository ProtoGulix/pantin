import { type AlignFramesResponse, JOINT_COORDINATE_UNITS, type Joint } from "@pantin/protocol";
import { createTranslator, type Language, pluralKey, type Translate } from "../i18n/translate.ts";
import { infoMessage, type PanelMessage } from "../messages.ts";
import { jointFormFor } from "./joint-edit-form.ts";
import type { JointFormState } from "./joint-form.ts";

// "Aligner le repère sur cet axe" (ADR 0056 point 5): one core command that
// turns the frame of the parent's assembly and of the group the joint moves.
// The core reads the stored axis, so the button waits for a saved form.

export interface AlignFramesButtonView {
  label: string;
  tooltip: string;
  disabled: boolean;
}

function hasUnsavedChanges(form: JointFormState, stored: Joint): boolean {
  const shown = jointFormFor(stored);
  const fieldIds = new Set([...Object.keys(form.values), ...Object.keys(shown.values)]);
  return (
    form.type !== stored.type ||
    [...fieldIds].some((fieldId) => form.values[fieldId] !== shown.values[fieldId])
  );
}

/** The button of the joint form: absent for a new or fixed joint, disabled while the form differs from the stored joint or a request runs. */
export function alignFramesButtonOf(
  form: JointFormState,
  joints: readonly Joint[],
  t: Translate,
  requestPending: boolean,
): AlignFramesButtonView | null {
  const stored = joints.find((joint) => joint.id === form.jointId);
  if (stored === undefined || JOINT_COORDINATE_UNITS[stored.type] === null) {
    return null;
  }
  const unsaved = hasUnsavedChanges(form, stored);
  return {
    label: t("joint.form.alignFrames"),
    tooltip: t(unsaved ? "joint.form.alignFrames.saveFirst" : "joint.form.alignFrames.hint"),
    disabled: unsaved || requestPending,
  };
}

/** What the command did: the assemblies turned and the joints rewritten, or that nothing was needed. */
export function alignFramesMessage(
  response: AlignFramesResponse,
  language: Language,
): PanelMessage {
  if (response.reframedAssemblies.length === 0) {
    return infoMessage("message.framesAlreadyAligned");
  }
  const translate = createTranslator(language);
  const names = response.reframedAssemblies.map(
    (key) => response.pantin.document.assemblies.find((item) => item.key === key)?.name ?? key,
  );
  return infoMessage(pluralKey("message.framesAligned", names.length, language), {
    assemblies: names.join(", "),
    joints:
      response.rewrittenJoints.length === 0
        ? ""
        : translate("message.framesAligned.joints", {
            names: response.rewrittenJoints.map((joint) => joint.name).join(", "),
          }),
  });
}
