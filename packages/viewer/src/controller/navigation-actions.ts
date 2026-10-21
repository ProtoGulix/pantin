import type { ViewportPick } from "../alignment/pick-resolution.ts";
import type { Vector3Tuple } from "../frames.ts";
import { infoMessage } from "../messages.ts";
import {
  ARROW_STEPS_DEGREES,
  isNavigationPresetId,
  type NavigationSettings,
} from "../navigation/navigation-settings.ts";
import { normalToDirectionOf, withNormalToToggled } from "../navigation/normal-to.ts";
import {
  anglesFromDirection,
  isStandardViewId,
  STANDARD_VIEWS,
} from "../navigation/standard-views.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The navigation settings of the 3D view (ADR 0036 points 1, 2, 6, 7): display
// state of the viewer, kept in the browser, never in the Pantin.

function changeNavigation(store: ViewerStore, change: Partial<NavigationSettings>): void {
  const navigation = { ...store.state.navigation, ...change };
  store.ports.storeNavigation(navigation);
  store.update({ ...store.state, navigation });
}

/** An unknown preset name is ignored: the command is a plain string by now. */
export function setNavigationPreset(store: ViewerStore, preset: string): void {
  if (isNavigationPresetId(preset) && preset !== store.state.navigation.preset) {
    changeNavigation(store, { preset });
  }
}

export function toggleReverseWheel(store: ViewerStore): void {
  changeNavigation(store, { reverseWheel: !store.state.navigation.reverseWheel });
}

export function togglePerspective(store: ViewerStore): void {
  changeNavigation(store, { perspective: !store.state.navigation.perspective });
}

/** A step that is not offered by the menu is ignored. */
export function setArrowStep(store: ViewerStore, degrees: string): void {
  const arrowStepDegrees = Number(degrees);
  if (
    ARROW_STEPS_DEGREES.includes(arrowStepDegrees) &&
    arrowStepDegrees !== store.state.navigation.arrowStepDegrees
  ) {
    changeNavigation(store, { arrowStepDegrees });
  }
}

/** The camera turns to look from this core direction (a cube cell). */
export function showViewFromDirection(store: ViewerStore, direction: Vector3Tuple): void {
  store.ports.viewport().showView(anglesFromDirection(direction));
}

/** An unknown view name is ignored: the command is a plain string by now. */
export function showStandardView(store: ViewerStore, viewId: string): void {
  if (isStandardViewId(viewId)) {
    showViewFromDirection(store, STANDARD_VIEWS[viewId].camera);
  }
}

/** "Vue précédente" (Ctrl+Shift+Z): the camera goes back to the view before its last change. */
export function showPreviousView(store: ViewerStore): void {
  store.ports.viewport().previousView();
}

/** "Vue normale à une face" (Ctrl+8): waits for a click on a face; the same command cancels. */
export function toggleNormalTo(store: ViewerStore): void {
  const next = withNormalToToggled(store.state);
  store.update(next.normalTo ? { ...next, message: infoMessage("message.normalToWaiting") } : next);
}

/** A click in the 3D view while "Normal To" waits: the camera squares to the face, the mode ends. */
export function receiveNormalToPick(store: ViewerStore, click: ViewportPick | null): void {
  // A click on empty space keeps waiting.
  if (click === null) {
    return;
  }
  store.update({ ...store.state, normalTo: false, message: null });
  showViewFromDirection(store, normalToDirectionOf(click));
}

// A failed mesh load is tried again, with the message that reported it cleared.
export function retryMeshLoad(store: ViewerStore): void {
  store.update({ ...store.state, message: null });
  store.ports.viewport().retryFailedBodies();
}
