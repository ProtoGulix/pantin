import type { Joint, JointCoordinateUnit } from "@pantin/protocol";
import {
  coordinateFromDisplay,
  coordinateToDisplay,
  type DisplayUnit,
  displayUnitOf,
} from "../units.ts";
import { coordinateLimits, coordinateUnitOf } from "./joint-parameters.ts";

// What a joint's slider needs, in display units. A joint that cannot move has
// no slider. The slider only asks the core to move the joint: the bodies
// follow the pose stream (ADR 0016 point 5), nothing moves locally.

export interface JointSliderSpec {
  // The Pantin the joint belongs to: a value sent late must not reach another one.
  pantinId: string;
  jointId: string;
  name: string;
  // Never null: only movable joints have a slider.
  coordinateUnit: Exclude<JointCoordinateUnit, null>;
  displayUnit: DisplayUnit;
  min: number;
  max: number;
  step: number;
}

// Half-range of a coordinate that declares no limits (a continuous joint).
const UNBOUNDED_HALF_RANGE: Readonly<Record<DisplayUnit, number>> = { mm: 1000, degree: 360 };
const STEP: Readonly<Record<DisplayUnit, number>> = { mm: 0.1, degree: 0.1 };

export function buildJointSlider(pantinId: string, joint: Joint): JointSliderSpec | null {
  const coordinateUnit = coordinateUnitOf(joint);
  const displayUnit = displayUnitOf(coordinateUnit);
  if (coordinateUnit === null || displayUnit === null) {
    return null;
  }
  const limits = coordinateLimits(joint);
  const half = UNBOUNDED_HALF_RANGE[displayUnit];
  return {
    pantinId,
    jointId: joint.id,
    name: joint.name,
    coordinateUnit,
    displayUnit,
    min: limits === null ? -half : coordinateToDisplay(coordinateUnit, limits.lower),
    max: limits === null ? half : coordinateToDisplay(coordinateUnit, limits.upper),
    step: STEP[displayUnit],
  };
}

/** The slider's value for the core's position (SI); 0 until the stream has told us. */
export function sliderValue(spec: JointSliderSpec, position: number | undefined): number {
  const shown = position === undefined ? 0 : coordinateToDisplay(spec.coordinateUnit, position);
  return Math.min(spec.max, Math.max(spec.min, shown));
}

/** The position to send to the core (SI) for a slider value. */
export function positionFromSlider(spec: JointSliderSpec, value: number): number {
  return coordinateFromDisplay(spec.coordinateUnit, value);
}
