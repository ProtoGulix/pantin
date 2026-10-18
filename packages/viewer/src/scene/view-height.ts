import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * The world height the active camera sees at a point, so that an overlay can keep a
 * constant share of the screen. 1 m when the scene has no camera yet.
 */
export function visibleHeightAt(scene: Scene, at: Vector3): number {
  const camera = scene.activeCamera;
  if (camera === null) {
    return 1;
  }
  if (camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
    // camera-view.ts sets the bounds from the view each frame (ADR 0036); the
    // fallback only covers a camera whose bounds were never set.
    return (camera.orthoTop ?? 1) - (camera.orthoBottom ?? -1);
  }
  return 2 * Vector3.Distance(camera.globalPosition, at) * Math.tan(camera.fov / 2);
}
