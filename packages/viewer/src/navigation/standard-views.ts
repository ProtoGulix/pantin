import { coreToBabylonPosition, type Vector3Tuple } from "../frames.ts";
import type { MessageKey } from "../i18n/translate.ts";

// The standard views of ADR 0036 point 4, in the core frame (Z up, as stored).
// The turntable camera is Babylon.js's ArcRotateCamera, so each direction is
// turned into its alpha and beta at the frames.ts boundary.

export const STANDARD_VIEW_IDS = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "isometric",
] as const;
export type StandardViewId = (typeof STANDARD_VIEW_IDS)[number];

export interface StandardView {
  id: StandardViewId;
  labelKey: MessageKey;
  // Unit vector from the target towards the camera, core frame.
  camera: Vector3Tuple;
  // Screen axes of the view, core frame; null for the isometric view, which
  // only has +Z vertical on screen.
  right: Vector3Tuple | null;
  up: Vector3Tuple | null;
}

const ISOMETRIC_SHARE = 1 / Math.sqrt(3);

export const STANDARD_VIEWS: Readonly<Record<StandardViewId, StandardView>> = {
  front: {
    id: "front",
    labelKey: "view.front",
    camera: [0, -1, 0],
    right: [1, 0, 0],
    up: [0, 0, 1],
  },
  back: { id: "back", labelKey: "view.back", camera: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] },
  left: { id: "left", labelKey: "view.left", camera: [-1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] },
  right: {
    id: "right",
    labelKey: "view.right",
    camera: [1, 0, 0],
    right: [0, 1, 0],
    up: [0, 0, 1],
  },
  top: { id: "top", labelKey: "view.top", camera: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  bottom: {
    id: "bottom",
    labelKey: "view.bottom",
    camera: [0, 0, -1],
    right: [1, 0, 0],
    up: [0, -1, 0],
  },
  // From the front right top octant: the SolidWorks isometric, Y up turned to Z up.
  isometric: {
    id: "isometric",
    labelKey: "view.isometric",
    camera: [ISOMETRIC_SHARE, -ISOMETRIC_SHARE, ISOMETRIC_SHARE],
    right: null,
    up: null,
  },
};

export function isStandardViewId(value: string): value is StandardViewId {
  return (STANDARD_VIEW_IDS as readonly string[]).includes(value);
}

export interface CameraAngles {
  alpha: number;
  beta: number;
}

// Babylon.js keeps beta this far from the poles by default (lowerBetaLimit
// 0.01), so Top and Bottom are seen 0.6 degrees off the vertical.
const POLE_MARGIN = 0.01;
// Alpha of the Front view. It is also the one that puts +X (core) on the
// right of Top and Bottom, where the direction alone does not fix alpha.
const FRONT_ALPHA = -Math.PI / 2;

/** Alpha and beta of a camera that looks at its target from this core direction. */
export function anglesFromDirection(coreDirection: Vector3Tuple): CameraAngles {
  const length = Math.hypot(...coreDirection);
  if (length === 0) {
    return { alpha: FRONT_ALPHA, beta: Math.PI / 2 };
  }
  const [x, y, z] = coreToBabylonPosition([
    coreDirection[0] / length,
    coreDirection[1] / length,
    coreDirection[2] / length,
  ]);
  const beta = Math.min(Math.PI - POLE_MARGIN, Math.max(POLE_MARGIN, Math.acos(y)));
  const overThePole = Math.hypot(x, z) < 1e-9;
  return { alpha: overThePole ? FRONT_ALPHA : Math.atan2(z, x), beta };
}

/** The same angle as `target`, turned by whole turns to lie within half a turn of `current`. */
export function shortestAlpha(current: number, target: number): number {
  const turn = 2 * Math.PI;
  return target + turn * Math.round((current - target) / turn);
}

const VIEW_ANIMATION_MILLISECONDS = 300;

/** Progress of a view change with a smooth start and end, from 0 to 1. */
export function easedProgress(elapsedMilliseconds: number): number {
  const linear = Math.min(1, Math.max(0, elapsedMilliseconds / VIEW_ANIMATION_MILLISECONDS));
  return linear * linear * (3 - 2 * linear);
}

export function anglesAt(from: CameraAngles, to: CameraAngles, progress: number): CameraAngles {
  return {
    alpha: from.alpha + (shortestAlpha(from.alpha, to.alpha) - from.alpha) * progress,
    beta: from.beta + (to.beta - from.beta) * progress,
  };
}
