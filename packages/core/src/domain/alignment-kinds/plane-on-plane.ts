import { scale, subtract } from "../rigid-transform.ts";
import { dot, threeStepMotion } from "./geometry.ts";
import { type AlignmentMotion, frameAt } from "./motion.ts";

// "Plan sur plan" (ADR 0035 point 5): the moving normal turns to face the
// target normal (along it with flip), then moves along the target normal only,
// so that the moving plane sits at `offset` from the target plane, positive
// being a gap. The moving origin keeps its position in the plane.
export const PLANE_ON_PLANE_MOTION: AlignmentMotion = (frames, { flip, offset, rotation }) => {
  const moving = frameAt(frames, 0);
  const target = frameAt(frames, 1);
  const normal = target.direction;
  const wanted = flip ? normal : scale(normal, -1);
  const distance = dot(subtract(moving.origin, target.origin), normal);
  return threeStepMotion(moving, wanted, scale(normal, offset - distance), normal, rotation);
};
