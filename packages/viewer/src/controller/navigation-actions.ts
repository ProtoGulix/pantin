import {
  ARROW_STEPS_DEGREES,
  isNavigationPresetId,
  type NavigationSettings,
} from "../navigation/navigation-settings.ts";
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
