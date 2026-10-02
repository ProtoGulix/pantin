import { subtract, type Vector3 } from "../rigid-transform.ts";
import {
  type ConnectorFrame,
  DIRECTION_EPSILON,
  dot,
  LENGTH_EPSILON,
  perpendicularPart,
  signedAngleAbout,
  turnAbout,
} from "./geometry.ts";
import { type AlignmentMotion, alignmentRefused, frameAt } from "./motion.ts";

// "Axe sur axe autour d'un pivot" (ADR 0035 point 5): only a rotation about
// the pivot axis, by the signed angle that brings the moving hole's axis to
// the target hole's, plus `rotation`. No minimal rotation, no translation.

function isParallel(direction: Vector3, axis: Vector3): boolean {
  return Math.abs(dot(direction, axis)) >= 1 - DIRECTION_EPSILON;
}

// Where the hole's axis crosses a plane perpendicular to the pivot axis,
// relative to the pivot axis.
function radialOffset(hole: ConnectorFrame, pivot: ConnectorFrame, role: string): Vector3 {
  const radial = perpendicularPart(subtract(hole.origin, pivot.origin), pivot.direction);
  if (Math.hypot(...radial) <= LENGTH_EPSILON) {
    throw alignmentRefused(`The ${role} hole lies on the pivot axis: there is no angle to turn.`);
  }
  return radial;
}

export const AXIS_AROUND_PIVOT_MOTION: AlignmentMotion = (frames, { rotation }) => {
  const pivot = frameAt(frames, 0);
  const movingHole = frameAt(frames, 1);
  const targetHole = frameAt(frames, 2);
  if (
    !isParallel(movingHole.direction, pivot.direction) ||
    !isParallel(targetHole.direction, pivot.direction)
  ) {
    throw alignmentRefused("The pivot and the two holes must have parallel axes.");
  }
  const from = radialOffset(movingHole, pivot, "moving");
  const to = radialOffset(targetHole, pivot, "target");
  const angle = signedAngleAbout(from, to, pivot.direction) + rotation;
  return turnAbout(pivot.origin, pivot.direction, angle);
};
