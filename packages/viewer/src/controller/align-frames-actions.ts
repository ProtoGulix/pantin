import { createTranslator } from "../i18n/translate.ts";
import { alignFramesButtonOf, alignFramesMessage } from "../joints/align-frames.ts";
import { jointFormFor } from "../joints/joint-edit-form.ts";
import { coreRefusalMessage, errorMessage } from "../messages.ts";
import { withRequestFinished, withRequestStarted } from "../viewer-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// "Aligner le repère sur cet axe" (ADR 0056): one core command. The core
// words its refusals as final sentences, shown as they are.

export async function alignFramesOnJointAxis(store: ViewerStore): Promise<void> {
  const { jointForm, openPantin: open } = store.state;
  // A second press while the first is answered would send the command twice.
  if (
    jointForm === null ||
    jointForm.jointId === null ||
    open === null ||
    store.state.pendingRequestCount > 0
  ) {
    return;
  }
  const jointId = jointForm.jointId;
  // Typing does not redraw the form, so the button may still look enabled.
  const button = alignFramesButtonOf(
    jointForm,
    open.document.joints,
    createTranslator(store.state.language),
    false,
  );
  if (button === null || button.disabled) {
    store.update({ ...store.state, message: errorMessage("joint.form.alignFrames.saveFirst") });
    return;
  }
  store.update(withRequestStarted(store.state));
  try {
    const answer = await store.ports.api.alignFrames(open.id, jointId);
    const shown = store.applyIfStillRequested(withRequestFinished(store.state), answer.pantin);
    // The joint's axis may have been rewritten: the form shows the stored one again.
    const rewritten = answer.pantin.document.joints.find((joint) => joint.id === jointId);
    store.update({
      ...shown,
      jointForm:
        shown.jointForm?.jointId === jointId && rewritten !== undefined
          ? jointFormFor(rewritten)
          : shown.jointForm,
      message: alignFramesMessage(answer, store.state.language),
    });
  } catch (error) {
    store.update({ ...withRequestFinished(store.state), message: coreRefusalMessage(error) });
  }
}
