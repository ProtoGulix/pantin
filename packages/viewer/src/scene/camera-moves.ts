import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { type ArrowKey, arrowPan, arrowRotation, viewBasis } from "../navigation/turntable.ts";
import {
  cursorZoomTargetShift,
  factorWithinLimits,
  type ScreenShift,
} from "../navigation/zoom-math.ts";
import type { CameraView } from "./camera-view.ts";

// What the wheel, the zoom drag and the arrow keys do to the camera. Each
// calls `taken` first: the pivot of a rotation gives way to any other move.

export interface CameraMoves {
  /** Multiplies the visible half height by `factor` (above 1 zooms out) about a cursor in -1..1, y up. */
  zoomAbout(factor: number, cursorX: number, cursorY: number): void;
  turnByArrow(key: ArrowKey, shift: boolean, stepDegrees: number): void;
  panByArrow(key: ArrowKey): void;
}

export function createCameraMoves(
  scene: Scene,
  camera: ArcRotateCamera,
  view: CameraView,
  taken: () => void,
): CameraMoves {
  const moveTarget = (shift: ScreenShift): void => {
    const { right, up } = viewBasis(camera.alpha, camera.beta);
    camera.target.addInPlaceFromFloats(
      right[0] * shift.right + up[0] * shift.up,
      right[1] * shift.right + up[1] * shift.up,
      right[2] * shift.right + up[2] * shift.up,
    );
  };
  return {
    zoomAbout(factor, cursorX, cursorY) {
      taken();
      const before = view.halfHeight();
      const { lower, upper } = view.limits();
      const applied = factorWithinLimits(before, factor, lower, upper);
      const halfWidth = before * scene.getEngine().getAspectRatio(camera);
      moveTarget(cursorZoomTargetShift(cursorX, cursorY, halfWidth, before, applied));
      view.setHalfHeight(before * applied);
    },
    turnByArrow(key, shift, stepDegrees) {
      taken();
      const step = arrowRotation(key, shift, stepDegrees);
      camera.alpha += step.alpha;
      camera.beta += step.beta;
    },
    panByArrow(key) {
      taken();
      moveTarget(arrowPan(key, view.halfHeight()));
    },
  };
}
