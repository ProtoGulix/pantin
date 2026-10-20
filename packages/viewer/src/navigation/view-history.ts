import type { Vector3Tuple } from "../frames.ts";

// The camera's "Vue précédente" (ADR 0036, Ctrl+Shift+Z): the views the user
// left, newest last, bounded. A view is what the user sees: the two angles,
// the point looked at and the zoom. The target is kept in Babylon.js's own
// world, as the camera holds it: it never leaves the camera layer.

export interface ViewSnapshot {
  alpha: number;
  beta: number;
  target: Vector3Tuple;
  halfHeight: number;
}

export type ViewHistory = readonly ViewSnapshot[];

export const NO_VIEWS: ViewHistory = [];

/** Enough to walk back through a long session, not enough to grow without end. */
export const MAX_REMEMBERED_VIEWS = 50;

// Far below what an eye can tell apart, above the noise of the same gesture.
const SAME_VIEW_TOLERANCE = 1e-6;

export function sameView(first: ViewSnapshot, second: ViewSnapshot): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= SAME_VIEW_TOLERANCE;
  return (
    near(first.alpha, second.alpha) &&
    near(first.beta, second.beta) &&
    near(first.halfHeight, second.halfHeight) &&
    first.target.every((value, index) => near(value, second.target[index] ?? Number.NaN))
  );
}

/** The history with this view added; a view equal to the last one is not repeated. */
export function withViewRemembered(history: ViewHistory, view: ViewSnapshot): ViewHistory {
  const last = history[history.length - 1];
  if (last !== undefined && sameView(last, view)) {
    return history;
  }
  return [...history, view].slice(-MAX_REMEMBERED_VIEWS);
}

export interface StepBack {
  history: ViewHistory;
  view: ViewSnapshot;
}

/**
 * The view to go back to from `current`, and the history without it. Views
 * equal to the current one are skipped, so that a click that moved nothing
 * does not make the command look dead. Null when there is nothing earlier.
 */
export function stepBack(history: ViewHistory, current: ViewSnapshot): StepBack | null {
  let remaining = history;
  while (remaining.length > 0) {
    const view = remaining[remaining.length - 1];
    remaining = remaining.slice(0, -1);
    if (view !== undefined && !sameView(view, current)) {
      return { history: remaining, view };
    }
  }
  return null;
}

// A pause this long between two events starts a new gesture.
const GESTURE_QUIET_MILLISECONDS = 500;

/** A gesture that goes on (wheel turns, held arrow key) is one step back, not one per event. */
export function startsGesture(lastEventMilliseconds: number | null, now: number): boolean {
  return lastEventMilliseconds === null || now - lastEventMilliseconds > GESTURE_QUIET_MILLISECONDS;
}
