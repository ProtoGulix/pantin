import type { PantinResponse } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";

// Display logic of the warning "modified outside Pantin" (ADR 0063 point 5). The core
// decides what changed (PantinResponse.changedOutside); the viewer only says it and
// offers to read the files again. Pure: no DOM, no clock of its own.

export interface ExternalEditBannerView {
  text: string;
  // Spoken before the text by the glyph, so the warning is not only a colour or a shape.
  glyphLabel: string;
  reloadLabel: string;
}

/** The banner of the open Pantin, or null while nothing changed outside. */
export function buildExternalEditBanner(
  open: PantinResponse | null,
  t: Translate,
): ExternalEditBannerView | null {
  const changed = open?.changedOutside ?? [];
  const [first] = changed;
  if (first === undefined) {
    return null;
  }
  const several = changed.length > 1;
  return {
    text: several ? t("externalEdit.both") : t("externalEdit.one", { file: first }),
    glyphLabel: t("externalEdit.glyph"),
    reloadLabel: t(several ? "externalEdit.reload.both" : "externalEdit.reload.one"),
  };
}

/** The question asked before reloading over unsaved changes; null when nothing is asked. */
export function buildReloadQuestion(
  open: PantinResponse,
  pendingReload: boolean,
  t: Translate,
): string | null {
  const [first] = open.changedOutside;
  if (!pendingReload || first === undefined) {
    return null;
  }
  const name = open.document.name;
  return open.changedOutside.length > 1
    ? t("prompt.reload.text.both", { name })
    : t("prompt.reload.text.one", { file: first, name });
}

/** Reloading throws away the unsaved edits, so it asks first when there are some. */
export function reloadNeedsConfirmation(open: PantinResponse): boolean {
  return open.unsavedChanges;
}

// Focus and visibilitychange often fire together when a window comes back.
export const FOCUS_REREAD_DEBOUNCE_MILLISECONDS = 1000;

export interface FocusRereadInputs {
  pantinOpen: boolean;
  requestInFlight: boolean;
  lastRereadAt: number | null;
  now: number;
}

/** Whether the window getting the focus back should re-read the open Pantin. */
export function shouldRereadOnFocus(inputs: FocusRereadInputs): boolean {
  if (!inputs.pantinOpen || inputs.requestInFlight) {
    return false;
  }
  return (
    inputs.lastRereadAt === null ||
    inputs.now - inputs.lastRereadAt >= FOCUS_REREAD_DEBOUNCE_MILLISECONDS
  );
}
