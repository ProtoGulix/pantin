import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  targetKeepingPivot,
  toScreenAxes,
  type Vector,
  viewBasis,
} from "../navigation/turntable.ts";

// The centre of a rotation (ADR 0036 point 3): the point of a body under the
// cursor when the drag starts. The camera cannot look at it without turning
// (an ArcRotateCamera always looks at its target), so the target is not moved
// there; it is moved each frame so that the camera turns about the pivot, and
// the view does not jump when the drag starts.

export interface CameraPivot {
  /** A pivot for the rotation that starts now; null keeps the current target. */
  begin(point: Vector3 | null): void;
  /** The button is up: the pivot goes when the glide after the drag is over. */
  buttonReleased(): void;
  /** Any other camera move takes over: the pivot is forgotten at once. */
  release(): void;
  /** Called each frame, after the camera has applied its inputs. */
  follow(): void;
}

interface ActivePivot {
  point: Vector;
  // The pivot's offset from the target, along the screen's right, up and back.
  onScreen: Vector;
}

export function createCameraPivot(camera: ArcRotateCamera): CameraPivot {
  let active: ActivePivot | null = null;
  let dragging = false;
  let lastAlpha = camera.alpha;
  let lastBeta = camera.beta;
  return {
    begin(point) {
      dragging = true;
      if (point === null) {
        active = null;
        return;
      }
      const target = camera.target;
      active = {
        point: [point.x, point.y, point.z],
        onScreen: toScreenAxes(
          [point.x - target.x, point.y - target.y, point.z - target.z],
          viewBasis(camera.alpha, camera.beta),
        ),
      };
    },
    buttonReleased() {
      dragging = false;
    },
    release() {
      active = null;
      dragging = false;
    },
    follow() {
      const turned = camera.alpha !== lastAlpha || camera.beta !== lastBeta;
      lastAlpha = camera.alpha;
      lastBeta = camera.beta;
      if (active === null) {
        return;
      }
      if (!dragging && !turned) {
        active = null;
        return;
      }
      const target = targetKeepingPivot(
        active.point,
        active.onScreen,
        viewBasis(camera.alpha, camera.beta),
      );
      camera.target.copyFromFloats(...target);
    },
  };
}
