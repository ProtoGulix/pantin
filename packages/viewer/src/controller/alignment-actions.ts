import {
  ALIGNMENT_KINDS,
  type AlignRequest,
  type AlignResponse,
  type FaceFile,
} from "@pantin/protocol";
import { ALIGNMENT_KIND_ORDER, PICK_REFUSAL_MESSAGES } from "../alignment/alignment-labels.ts";
import {
  type AlignmentSession,
  alignRequestOf,
  newAlignmentSession,
  withKind,
  withoutPicks,
  withPick,
} from "../alignment/alignment-session.ts";
import { isAligning } from "../alignment/alignment-view.ts";
import { resolveAlignmentPick, type ViewportPick } from "../alignment/pick-resolution.ts";
import { anchorOfAssembly } from "../assembly-anchor.ts";
import { createTranslator } from "../i18n/translate.ts";
import { describeFailure, errorMessage, infoMessage, type PanelMessage } from "../messages.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Alignment by picked faces (ADR 0035 points 3, 6 and 8): the session lives
// in the viewer, every pick is checked at once, and the core computes and
// stores the result when the user applies it.

function updateSession(
  store: ViewerStore,
  change: (session: AlignmentSession) => AlignmentSession,
) {
  const { alignment } = store.state;
  if (alignment !== null) {
    store.update({ ...store.state, alignment: change(alignment), message: null });
  }
}

/** Starts aligning the selected assembly, or stops; the gizmo goes off meanwhile. */
export function toggleAlignment(store: ViewerStore): void {
  const { state } = store;
  if (isAligning(state)) {
    store.update({ ...state, alignment: null });
    return;
  }
  const ref = parseNodeId(selectedNodeIdOf(state.selection) ?? "");
  if (
    state.openPantin === null ||
    ref?.kind !== "assembly" ||
    ref.pantinId !== state.openPantin.id
  ) {
    return;
  }
  const alignment = newAlignmentSession(state.openPantin.id, ref.key);
  // A body id comes back after a deletion and a new import: face files are
  // read again for each alignment rather than trusted across edits.
  store.faceFiles.clear();
  store.update({ ...state, gizmoMode: null, alignment, message: null });
}

export function chooseAlignmentKind(store: ViewerStore, kind: string): void {
  const chosen = ALIGNMENT_KIND_ORDER.find((candidate) => candidate === kind);
  if (chosen !== undefined) {
    updateSession(store, (session) => withKind(session, chosen));
  }
}

export function setAlignmentText(store: ViewerStore, field: "offset" | "rotation", text: string) {
  updateSession(store, (session) =>
    field === "offset" ? { ...session, offsetText: text } : { ...session, rotationText: text },
  );
}

export function setAlignmentFlip(store: ViewerStore, flip: boolean): void {
  updateSession(store, (session) => ({ ...session, flip }));
}

export function setAlignmentFixedJoint(store: ViewerStore, fixedJoint: boolean): void {
  updateSession(store, (session) => ({ ...session, fixedJoint }));
}

export function restartAlignment(store: ViewerStore): void {
  updateSession(store, withoutPicks);
}

// One request per mesh file: the face file never changes while its mesh exists.
function faceFileOf(
  store: ViewerStore,
  pantinId: string,
  meshPath: string,
): Promise<FaceFile | null> {
  const key = `${pantinId}|${meshPath}`;
  let known = store.faceFiles.get(key);
  if (known === undefined) {
    known = store.ports.api.fetchFaceFile(pantinId, meshPath);
    store.faceFiles.set(key, known);
    // A failed download is tried again on the next click.
    known.catch(() => store.faceFiles.delete(key));
  }
  return known;
}

/** A click in the 3D view while aligning. */
export async function receiveAlignmentPick(
  store: ViewerStore,
  click: ViewportPick | null,
): Promise<void> {
  const open = store.state.openPantin;
  const body = open?.document.bodies.find((candidate) => candidate.id === click?.bodyId);
  if (click === null || open === null || body === undefined) {
    return;
  }
  let faceFile: FaceFile | null;
  try {
    faceFile = await faceFileOf(store, open.id, body.mesh);
  } catch (error) {
    store.update({ ...store.state, message: describeFailure(error) });
    return;
  }
  // The session as it is now: another click may have landed meanwhile.
  const { alignment, openPantin } = store.state;
  if (alignment === null || openPantin === null || openPantin.id !== alignment.pantinId) {
    return;
  }
  const outcome = resolveAlignmentPick(openPantin.document, alignment, click, faceFile);
  store.update(
    outcome.ok
      ? {
          ...store.state,
          alignment: withPick(alignment, outcome.index, outcome.state),
          message: null,
        }
      : { ...store.state, message: infoMessage(PICK_REFUSAL_MESSAGES[outcome.refusal]) },
  );
}

// The first pick of each side: the fixed joint links them (ADR 0035 point 8).
function sideBodies(session: AlignmentSession): {
  moving: string | undefined;
  target: string | undefined;
} {
  const roles = ALIGNMENT_KINDS[session.kind].picks;
  const bodyOfSide = (side: "moving" | "target") =>
    session.picks.find((_pick, index) => roles[index]?.side === side)?.pick.body;
  return { moving: bodyOfSide("moving"), target: bodyOfSide("target") };
}

const REQUEST_ERRORS = {
  missingPicks: "alignment.invalid",
  invalid: "alignment.invalid",
  invalidOffset: "alignment.invalidOffset",
  invalidRotation: "alignment.invalidRotation",
} as const;

async function alignThenLink(store: ViewerStore, session: AlignmentSession, request: AlignRequest) {
  const document = store.state.openPantin?.document;
  const { moving, target } = sideBodies(session);
  const link =
    session.fixedJoint &&
    document !== undefined &&
    anchorOfAssembly(document, session.assemblyKey) === null;
  return editPantin(store, session.pantinId, async (id) => {
    const aligned = await store.ports.api.alignAssembly(id, session.assemblyKey, request);
    if (!link || moving === undefined || target === undefined) {
      return { aligned, linked: false, jointError: null };
    }
    // The placement is stored by now: a failed joint must not keep the
    // viewer from reading the Pantin again.
    try {
      const name = (bodyId: string) =>
        document?.bodies.find((candidate) => candidate.id === bodyId)?.name ?? bodyId;
      await store.ports.api.createJoint(id, {
        type: "fixed",
        name: createTranslator(store.state.language)("alignment.jointName", {
          moving: name(moving),
          target: name(target),
        }),
        parent: target,
        child: moving,
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      });
      return { aligned, linked: true, jointError: null };
    } catch (error) {
      return { aligned, linked: false, jointError: error };
    }
  });
}

function resultMessage(result: {
  aligned: AlignResponse;
  linked: boolean;
  jointError: unknown;
}): PanelMessage {
  if (result.jointError !== null) {
    const { jointError } = result;
    const detail = jointError instanceof Error ? jointError.message : String(jointError);
    return errorMessage("alignment.jointFailed", {}, detail);
  }
  const displaced = result.aligned.targetDisplaced && !result.linked;
  return infoMessage(displaced ? "alignment.targetDisplaced" : "alignment.done");
}

/** Sends the alignment; the picks start over for the next one. */
export async function applyAlignment(store: ViewerStore): Promise<void> {
  const session = store.state.alignment;
  if (session === null) {
    return;
  }
  const outcome = alignRequestOf(session);
  if (!outcome.ok) {
    store.update({ ...store.state, message: errorMessage(REQUEST_ERRORS[outcome.reason]) });
    return;
  }
  const result = await alignThenLink(store, session, outcome.request);
  if (result === undefined) {
    return;
  }
  const current = store.state.alignment;
  store.update({
    ...store.state,
    alignment: current === null ? null : withoutPicks(current),
    message: resultMessage(result),
  });
}
