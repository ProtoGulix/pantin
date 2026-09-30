// The zones of a switch along its joint's coordinate (ADR 0025 point 2):
// geometry only, read by the core's evaluation and by clients that draw the
// switch. Bounds may be infinite: a limit switch stays on however far it is
// pushed.

export type Interval = readonly [number, number];

export interface SwitchZones {
  // Where an off switch turns on.
  on: Interval;
  // Where an on switch stays on: the on zone widened by the hysteresis.
  hold: Interval;
  // What to draw: finite, the actuated stretch of the stroke.
  shown: Interval;
}

/** From `bound` upwards (increasing) or downwards (decreasing), without end. */
export function beyond(bound: number, direction: "increasing" | "decreasing"): Interval {
  return direction === "increasing"
    ? [bound, Number.POSITIVE_INFINITY]
    : [Number.NEGATIVE_INFINITY, bound];
}
