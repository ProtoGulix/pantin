// Zoom and orthographic bounds, as pure arithmetic (ADR 0036 points 2 and 6).
//
// The state of a zoom is the visible half height of the target plane. The
// perspective camera sits at the distance that shows it (see view-scale.ts);
// the orthographic one stays at a fixed safe distance and takes its bounds
// from it, so zooming never moves an orthographic camera through the scene.

// A factor above 1 zooms out (the radius grows), below 1 zooms in.
const WHEEL_RATE_PER_PIXEL = 0.0015;
const DRAG_RATE_PER_PIXEL = 0.005;
const LARGEST_STEP_FACTOR = 2;

function limited(factor: number): number {
  return Math.min(LARGEST_STEP_FACTOR, Math.max(1 / LARGEST_STEP_FACTOR, factor));
}

/**
 * The zoom a wheel turn gives. deltaY below 0 is the wheel pushed away from
 * you; the preset says whether that zooms out, and the "reverse wheel"
 * setting flips it.
 */
export function wheelZoomFactor(
  deltaY: number,
  forwardZoomsOut: boolean,
  reverseWheel: boolean,
): number {
  const forwardZoomsIn = forwardZoomsOut === reverseWheel;
  return limited(Math.exp((forwardZoomsIn ? 1 : -1) * deltaY * WHEEL_RATE_PER_PIXEL));
}

/** Shift + middle drag: dragging up zooms in (NOT VERIFIED against SolidWorks). */
export function dragZoomFactor(deltaYPixels: number): number {
  return limited(Math.exp(deltaYPixels * DRAG_RATE_PER_PIXEL));
}

/** The factor that keeps a size (half height) inside its limits; a null limit is no limit. */
export function factorWithinLimits(
  size: number,
  factor: number,
  lowerLimit: number | null,
  upperLimit: number | null,
): number {
  const wanted = size * factor;
  const lowest = lowerLimit ?? 0;
  const highest = upperLimit ?? Number.POSITIVE_INFINITY;
  return Math.min(highest, Math.max(lowest, wanted)) / size;
}

/**
 * Half the height of the target plane that a perspective camera at this
 * distance shows. Exact for the target plane only: nearer or farther things
 * are scaled by perspective, so "the point under the cursor stays put" holds
 * for points on that plane, and nearly so for points close to it.
 */
export function visibleHalfHeight(radius: number, verticalFieldOfView: number): number {
  return radius * Math.tan(verticalFieldOfView / 2);
}

export interface OrthographicBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function orthographicBounds(halfHeight: number, aspectRatio: number): OrthographicBounds {
  const halfWidth = halfHeight * aspectRatio;
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}

export interface ScreenShift {
  right: number;
  up: number;
}

/**
 * How far the target moves, along the screen's right and up, when the visible
 * half height is multiplied by `factor` so that the point under the cursor stays under it.
 * The cursor is in normalised device coordinates (-1 to 1, y up) and the
 * half sizes are those of the target plane before the zoom.
 */
export function cursorZoomTargetShift(
  cursorX: number,
  cursorY: number,
  halfWidth: number,
  halfHeight: number,
  factor: number,
): ScreenShift {
  return {
    right: cursorX * halfWidth * (1 - factor),
    up: cursorY * halfHeight * (1 - factor),
  };
}
