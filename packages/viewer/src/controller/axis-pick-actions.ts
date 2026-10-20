import type { FaceFile } from "@pantin/protocol";
import { PICK_REFUSAL_MESSAGES } from "../alignment/alignment-labels.ts";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import {
  axisPickRequestOf,
  isPickingAxis,
  withAxisAnswer,
  withAxisPickStarted,
} from "../joints/axis-pick.ts";
import { describeFailure, infoMessage } from "../messages.ts";
import { faceFileOf, receiveAlignmentPick } from "./alignment-actions.ts";
import { receiveNormalToPick } from "./navigation-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// "Prendre l'axe sur une face" (ADR 0041): the button waits for one click in
// the 3D view, the core answers the axis, the form shows it. Nothing is saved
// here: the form's usual save does it.

/** The button is a toggle: pressed while waiting, a second press cancels. */
export function startAxisPick(store: ViewerStore): void {
  if (isPickingAxis(store.state)) {
    store.update({ ...store.state, axisPick: null });
    return;
  }
  // Face files are read again for each pick, as for an alignment.
  store.faceFiles.clear();
  store.update(withAxisPickStarted(store.state));
}

/** Where a click in the 3D view goes: the axis pick when one waits, else the alignment. */
export async function receiveViewportPick(
  store: ViewerStore,
  click: ViewportPick | null,
): Promise<void> {
  if (store.state.normalTo) {
    receiveNormalToPick(store, click);
  } else if (isPickingAxis(store.state)) {
    await receiveAxisPick(store, click);
  } else {
    await receiveAlignmentPick(store, click);
  }
}

async function faceFileOrMessage(
  store: ViewerStore,
  pantinId: string,
  meshPath: string,
): Promise<{ faceFile: FaceFile | null } | null> {
  try {
    return { faceFile: await faceFileOf(store, pantinId, meshPath) };
  } catch (error) {
    store.update({ ...store.state, message: describeFailure(error) });
    return null;
  }
}

async function receiveAxisPick(store: ViewerStore, click: ViewportPick | null): Promise<void> {
  const { axisPick, openPantin: open } = store.state;
  const body = open?.document.bodies.find((candidate) => candidate.id === click?.bodyId);
  // A click on empty space does nothing.
  if (axisPick === null || click === null || open === null || body === undefined) {
    return;
  }
  const read = await faceFileOrMessage(store, open.id, body.mesh);
  if (read === null) {
    return;
  }
  const asked = axisPickRequestOf(click, read.faceFile);
  if (!asked.ok) {
    store.update({ ...store.state, message: infoMessage(PICK_REFUSAL_MESSAGES[asked.refusal]) });
    return;
  }
  try {
    const answer = await store.ports.api.jointAxisFromFace(
      open.id,
      axisPick.jointId,
      asked.request,
    );
    // The mode may have ended while the core was answering.
    const { jointForm, axisPick: current } = store.state;
    if (jointForm === null || current === null || !current.waiting) {
      return;
    }
    store.update({
      ...store.state,
      jointForm: withAxisAnswer(jointForm, answer),
      axisPick: { ...current, waiting: false, highlight: asked.highlight },
      message: null,
    });
  } catch (error) {
    // Refused: the fields stay, the mode keeps waiting for another face.
    store.update({ ...store.state, message: describeFailure(error) });
  }
}
