import type { Direction } from "./schema-common.ts";

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
export function beyond(bound: number, direction: Direction): Interval {
  return direction === "increasing"
    ? [bound, Number.POSITIVE_INFINITY]
    : [Number.NEGATIVE_INFINITY, bound];
}

// The dimensioned diagram of a switch in the sensor form (ADR 0026 point 4),
// as data: clients draw every type the same way.

// How the sensor itself is drawn, where, and which way it looks at its
// target (null: it looks across the stroke, like a sensor in a slot).
export interface DiagramSymbol {
  kind: "plunger" | "face" | "slot" | "range";
  at: number;
  facing: Direction | null;
}

// A dimension line. A position is measured from the joint's reference
// (coordinate 0), a length between two coordinates. `label` names a
// parameter of the type, or one of its `dimensions` labels (labels.ts).
export type DiagramDimension =
  | { kind: "position"; at: number; label: string }
  | { kind: "length"; from: number; to: number; label: string };

export interface SwitchDiagram {
  symbol: DiagramSymbol;
  dimensions: readonly DiagramDimension[];
}
