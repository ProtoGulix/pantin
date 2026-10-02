import { add, scale, subtract } from "../rigid-transform.ts";
import { dot, perpendicularPart, threeStepMotion } from "./geometry.ts";
import { type AlignmentMotion, frameAt } from "./motion.ts";

// "Axe sur axe" (ADR 0035 point 5): the moving axis turns to the target axis,
// keeping the side it already points to, since the sign of a B-rep axis is
// arbitrary (flip turns it over), then moves across onto it. The axial
// position is kept, shifted by `offset` along the target axis.
export const AXIS_ON_AXIS_MOTION: AlignmentMotion = (frames, { flip, offset, rotation }) => {
  const moving = frameAt(frames, 0);
  const target = frameAt(frames, 1);
  const axis = target.direction;
  const side = dot(moving.direction, axis) >= 0 ? 1 : -1;
  const wanted = scale(axis, flip ? -side : side);
  const across = perpendicularPart(subtract(target.origin, moving.origin), axis);
  return threeStepMotion(moving, wanted, add(across, scale(axis, offset)), axis, rotation);
};
