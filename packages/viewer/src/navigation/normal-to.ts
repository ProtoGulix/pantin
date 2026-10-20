import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { showsViewport } from "../central-layout.ts";
import type { Vector3Tuple } from "../frames.ts";
import type { ViewerState } from "../viewer-state.ts";

// "Vue normale à une face" (ADR 0036, Ctrl+8): the menu item or its shortcut
// waits for one click on a body in the 3D view, then the camera looks square
// at the clicked face. Display state only: nothing is stored, the Pantin is
// never touched.

const WAITING_HINT_KEY = "message.normalToWaiting";

/** The state without the waiting hint, which only this mode shows; any other message stays. */
export function withoutNormalToHint(state: ViewerState): ViewerState {
  return state.message?.key === WAITING_HINT_KEY ? { ...state, message: null } : state;
}

/** Enters the mode, or leaves it when it is already on. One tool at a time. */
export function withNormalToToggled(state: ViewerState): ViewerState {
  if (state.normalTo) {
    return { ...state, normalTo: false, message: null };
  }
  if (state.openPantin === null) {
    return state;
  }
  return {
    ...state,
    normalTo: true,
    gizmoMode: null,
    alignment: null,
    axisPick: null,
    message: null,
  };
}

/**
 * The mode ends with its Pantin or its 3D view, and when another picking tool
 * or the gizmo starts: those clicks mean something else.
 */
export function withNormalToRules(state: ViewerState): ViewerState {
  if (!state.normalTo) {
    return state;
  }
  const alive =
    state.openPantin !== null &&
    showsViewport(state.centralLayout) &&
    state.alignment === null &&
    state.axisPick === null &&
    state.gizmoMode === null;
  return alive ? state : withoutNormalToHint({ ...state, normalTo: false });
}

/** True while a click in the 3D view is the "Normal To" pick. */
export function isPickingNormalTo(state: ViewerState): boolean {
  return state.normalTo;
}

/**
 * The direction from the face towards the camera: the clicked triangle's
 * normal, already turned to the side the camera sees. On a curved face it is
 * the normal where the click landed.
 */
export function normalToDirectionOf(click: ViewportPick): Vector3Tuple {
  return [click.normal[0], click.normal[1], click.normal[2]];
}
