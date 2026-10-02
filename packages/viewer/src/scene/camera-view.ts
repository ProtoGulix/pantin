import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  cameraDistance,
  clipPlanes,
  type FramedView,
  framedView,
  panningSensibility,
} from "../navigation/view-scale.ts";
import { orthographicBounds } from "../navigation/zoom-math.ts";

// The zoom of the 3D view and what depends on it (ADR 0036 points 2 and 6):
// the visible half height is the state; the camera distance, the clip planes,
// the orthographic bounds and the panning speed follow it each frame.

export interface CameraView {
  halfHeight(): number;
  /** Clamped to the limits of the framed view; returns the value kept. */
  setHalfHeight(halfHeight: number): number;
  limits(): { lower: number; upper: number };
  /** After framing: the zoom of the framing distance, and limits around it. */
  frame(framingRadius: number): void;
  setPerspective(perspective: boolean): void;
  /** Each frame, after the camera applied its inputs. */
  update(): void;
}

export function createCameraView(
  scene: Scene,
  canvas: HTMLCanvasElement,
  camera: ArcRotateCamera,
): CameraView {
  let framed: FramedView = framedView(camera.radius, camera.fov);
  let halfHeight = framed.halfHeight;
  let perspective = false;
  const distance = () =>
    cameraDistance(perspective, halfHeight, camera.fov, framed.orthographicDistance);
  const place = (): void => {
    camera.radius = distance();
    const { minZ, maxZ } = clipPlanes(camera.radius, framed.sceneRadius);
    camera.minZ = minZ;
    camera.maxZ = maxZ;
    camera.panningSensibility = panningSensibility(canvas.clientHeight || 1, halfHeight);
  };
  const view: CameraView = {
    halfHeight: () => halfHeight,
    setHalfHeight(wanted) {
      halfHeight = Math.min(framed.maxHalfHeight, Math.max(framed.minHalfHeight, wanted));
      place();
      return halfHeight;
    },
    limits: () => ({ lower: framed.minHalfHeight, upper: framed.maxHalfHeight }),
    frame(framingRadius) {
      framed = framedView(framingRadius, camera.fov);
      halfHeight = framed.halfHeight;
      // Babylon.js keeps a perspective radius inside these.
      const perPerspectiveRadius = 1 / Math.tan(camera.fov / 2);
      camera.lowerRadiusLimit = framed.minHalfHeight * perPerspectiveRadius;
      camera.upperRadiusLimit = framed.maxHalfHeight * perPerspectiveRadius;
      place();
    },
    setPerspective(next) {
      perspective = next;
      camera.mode = next ? Camera.PERSPECTIVE_CAMERA : Camera.ORTHOGRAPHIC_CAMERA;
      place();
    },
    update() {
      place();
      if (!perspective) {
        const bounds = orthographicBounds(halfHeight, scene.getEngine().getAspectRatio(camera));
        camera.orthoLeft = bounds.left;
        camera.orthoRight = bounds.right;
        camera.orthoTop = bounds.top;
        camera.orthoBottom = bounds.bottom;
      }
    },
  };
  return view;
}
