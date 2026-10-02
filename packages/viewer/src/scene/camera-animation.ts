import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { anglesAt, type CameraAngles, easedProgress } from "../navigation/standard-views.ts";

// A view change (ADR 0036 point 4): alpha and beta move to the new angles in
// 300 ms, in the same per-frame hook as the rest of the navigation. Target and
// zoom are not touched, so the view turns about what it was looking at. Not
// Babylon.js's interpolateTo: it moves the radius and the target as well, and
// it stops by itself on any input, where here the owner decides.

export interface ViewAnimator {
  goTo(angles: CameraAngles, nowMilliseconds: number): void;
  /** Any other move of the camera takes over. */
  cancel(): void;
  /** Each frame, before the pivot and the zoom are applied. */
  step(nowMilliseconds: number): void;
}

interface Running {
  from: CameraAngles;
  to: CameraAngles;
  startedAt: number;
}

export function createViewAnimator(camera: ArcRotateCamera): ViewAnimator {
  let running: Running | null = null;
  return {
    goTo(angles, nowMilliseconds) {
      running = {
        from: { alpha: camera.alpha, beta: camera.beta },
        to: angles,
        startedAt: nowMilliseconds,
      };
    },
    cancel() {
      running = null;
    },
    step(nowMilliseconds) {
      if (running === null) {
        return;
      }
      const progress = easedProgress(nowMilliseconds - running.startedAt);
      const angles = anglesAt(running.from, running.to, progress);
      camera.alpha = angles.alpha;
      camera.beta = angles.beta;
      if (progress >= 1) {
        running = null;
      }
    },
  };
}
