import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import {
  NO_VIEWS,
  startsGesture,
  stepBack,
  type ViewHistory,
  type ViewSnapshot,
  withViewRemembered,
} from "../navigation/view-history.ts";
import type { CameraView } from "./camera-view.ts";

// The camera's "Vue précédente" (ADR 0036): remembers the view before each
// gesture, and puts the last one back. The bookkeeping is in navigation/.

export interface CameraHistory {
  /** The view as it is now, before a change that starts. */
  remember(): void;
  /** Like `remember`, but only for the first event of a wheel turn or a held key. */
  rememberGesture(nowMilliseconds: number): void;
  /** The views of another Pantin mean nothing here. */
  forget(): void;
  /** Puts the previous view back at once; false when there is none. */
  back(): boolean;
}

function snapshotOf(camera: ArcRotateCamera, view: CameraView): ViewSnapshot {
  const { target } = camera;
  return {
    alpha: camera.alpha,
    beta: camera.beta,
    target: [target.x, target.y, target.z],
    halfHeight: view.halfHeight(),
  };
}

export function createCameraHistory(
  camera: ArcRotateCamera,
  view: CameraView,
  taken: () => void,
): CameraHistory {
  let history: ViewHistory = NO_VIEWS;
  let lastGestureEvent: number | null = null;
  const remember = (): void => {
    history = withViewRemembered(history, snapshotOf(camera, view));
  };
  return {
    remember,
    forget() {
      history = NO_VIEWS;
    },
    rememberGesture(now) {
      if (startsGesture(lastGestureEvent, now)) {
        remember();
      }
      lastGestureEvent = now;
    },
    back() {
      const found = stepBack(history, snapshotOf(camera, view));
      if (found === null) {
        return false;
      }
      history = found.history;
      taken();
      camera.alpha = found.view.alpha;
      camera.beta = found.view.beta;
      camera.target.copyFromFloats(...found.view.target);
      view.setHalfHeight(found.view.halfHeight);
      return true;
    },
  };
}
