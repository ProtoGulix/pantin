import { ALIGNMENT_KINDS, type AlignmentKind, type PantinDocument } from "@pantin/protocol";
import { anchorLinkOf } from "../assembly-anchor.ts";
import type { Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import {
  ALIGNMENT_KIND_LABELS,
  ALIGNMENT_KIND_ORDER,
  ALIGNMENT_PICK_LABELS,
} from "./alignment-labels.ts";
import {
  type AlignmentPickState,
  type AlignmentSession,
  type FaceHighlight,
  nextPickIndex,
} from "./alignment-session.ts";

// What the alignment panel shows (ADR 0035 points 3, 5, 6 and 8), as plain
// data: the kind, one line per pick, the parameters the kind has, and the
// fixed joint shortcut.

export interface AlignmentStepView {
  label: string;
  status: "done" | "current" | "waiting";
  detail: string;
}

export interface AlignmentView {
  title: string;
  kinds: { value: AlignmentKind; label: string }[];
  kind: AlignmentKind;
  steps: AlignmentStepView[];
  // Null when the kind has no such parameter.
  flip: boolean | null;
  offsetText: string | null;
  rotationText: string | null;
  fixedJoint: { checked: boolean; enabled: boolean; note: string | null };
  applyEnabled: boolean;
}

function pickDetail(document: PantinDocument, state: AlignmentPickState, t: Translate): string {
  const body = document.bodies.find((candidate) => candidate.id === state.pick.body);
  return t(`alignment.face.${state.faceKind}`, { body: body?.name ?? state.pick.body });
}

function stepsOf(document: PantinDocument, session: AlignmentSession, t: Translate) {
  const next = nextPickIndex(session);
  return ALIGNMENT_PICK_LABELS[session.kind].map((labelKey, index): AlignmentStepView => {
    const state = session.picks[index] ?? null;
    if (state !== null) {
      return { label: t(labelKey), status: "done", detail: pickDetail(document, state, t) };
    }
    const current = index === next;
    return {
      label: t(labelKey),
      status: current ? "current" : "waiting",
      detail: t(current ? "alignment.step.current" : "alignment.step.waiting"),
    };
  });
}

// ADR 0035 point 8: the shortcut is off when the assembly already hangs from
// another one, naming the joint that does.
function fixedJointOf(document: PantinDocument, session: AlignmentSession, t: Translate) {
  const link = anchorLinkOf(document, session.assemblyKey);
  if (link === null) {
    return { checked: session.fixedJoint, enabled: true, note: null };
  }
  const joint = document.joints.find((candidate) => candidate.child === link.childBodyId);
  return {
    checked: false,
    enabled: false,
    note: t("alignment.fixedJointTaken", { joint: joint?.name ?? link.childBodyId }),
  };
}

/**
 * The session of the open Pantin while its assembly exists, or null: then
 * nothing shows and a click selects again.
 */
function activeSession(state: ViewerState): AlignmentSession | null {
  const { alignment, openPantin } = state;
  const exists = openPantin?.document.assemblies.some(
    (assembly) => assembly.key === alignment?.assemblyKey,
  );
  return alignment !== null && openPantin?.id === alignment.pantinId && exists === true
    ? alignment
    : null;
}

/** True while clicks in the 3D view are alignment picks. */
export function isAligning(state: ViewerState): boolean {
  return activeSession(state) !== null;
}

/** The faces to tint in the 3D view. */
export function alignmentHighlightsOf(state: ViewerState): FaceHighlight[] {
  return (activeSession(state)?.picks ?? []).flatMap((pick) =>
    pick === null ? [] : [pick.highlight],
  );
}

export function buildAlignmentView(state: ViewerState, t: Translate): AlignmentView | null {
  const session = activeSession(state);
  const { openPantin } = state;
  const assembly = openPantin?.document.assemblies.find(
    (candidate) => candidate.key === session?.assemblyKey,
  );
  if (session === null || openPantin === null || assembly === undefined) {
    return null;
  }
  const { document } = openPantin;
  const parameters = ALIGNMENT_KINDS[session.kind].parameters;
  return {
    title: t("alignment.title", { name: assembly.name }),
    kinds: ALIGNMENT_KIND_ORDER.map((value) => ({
      value,
      label: t(ALIGNMENT_KIND_LABELS[value]),
    })),
    kind: session.kind,
    steps: stepsOf(document, session, t),
    flip: parameters.includes("flip") ? session.flip : null,
    offsetText: parameters.includes("offset") ? session.offsetText : null,
    rotationText: parameters.includes("rotation") ? session.rotationText : null,
    fixedJoint: fixedJointOf(document, session, t),
    applyEnabled: nextPickIndex(session) === null && state.pendingRequestCount === 0,
  };
}
