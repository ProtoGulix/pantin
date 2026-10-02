import { visibleHalfHeight } from "./zoom-math.ts";

// How the zoom of the 3D view maps to the camera (ADR 0036 points 2 and 6).
// The zoom is a visible half height. A perspective camera is placed at the
// distance that shows it; an orthographic camera stays at a fixed distance
// outside the scene, where nothing can cross its near plane.

// The user may zoom in to a hundredth of the framed view and out to five times it.
const SMALLEST_SHARE_OF_FRAMED = 0.01;
const LARGEST_SHARE_OF_FRAMED = 5;
const NEAR_SHARE_OF_DISTANCE = 0.001;
// Far plane: the camera distance plus this many scene radii, so a model
// that is panned off centre still stays inside it.
const FAR_SCENE_RADII = 20;

export interface FramedView {
  halfHeight: number;
  minHalfHeight: number;
  maxHalfHeight: number;
  // Distance of an orthographic camera: the framing distance, which is
  // outside the bounding sphere of what was framed.
  orthographicDistance: number;
  // Radius of that sphere, a little generous.
  sceneRadius: number;
}

export function framedView(framingRadius: number, verticalFieldOfView: number): FramedView {
  const halfHeight = visibleHalfHeight(framingRadius, verticalFieldOfView);
  return {
    halfHeight,
    minHalfHeight: halfHeight * SMALLEST_SHARE_OF_FRAMED,
    maxHalfHeight: halfHeight * LARGEST_SHARE_OF_FRAMED,
    orthographicDistance: framingRadius,
    sceneRadius: framingRadius * Math.sin(verticalFieldOfView / 2),
  };
}

/** Where the camera stands for this zoom: the same picture of the target plane in both modes. */
export function cameraDistance(
  perspective: boolean,
  halfHeight: number,
  verticalFieldOfView: number,
  orthographicDistance: number,
): number {
  return perspective ? halfHeight / Math.tan(verticalFieldOfView / 2) : orthographicDistance;
}

/** Near and far planes that keep the scene inside, whatever the distance. */
export function clipPlanes(distance: number, sceneRadius: number): { minZ: number; maxZ: number } {
  return {
    minZ: distance * NEAR_SHARE_OF_DISTANCE,
    maxZ: distance + FAR_SCENE_RADII * sceneRadius,
  };
}

/**
 * Babylon.js's panning sensibility: pixels of drag per world unit. The target
 * plane is canvasHeight pixels for twice the half height, so the point under
 * the cursor follows the mouse at any zoom.
 */
export function panningSensibility(canvasHeightPixels: number, halfHeight: number): number {
  return canvasHeightPixels / (2 * halfHeight);
}
