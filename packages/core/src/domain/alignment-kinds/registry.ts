import type { AlignmentKind } from "@pantin/protocol";
import { AXIS_AROUND_PIVOT_MOTION } from "./axis-around-pivot.ts";
import { AXIS_ON_AXIS_MOTION } from "./axis-on-axis.ts";
import type { AlignmentMotion } from "./motion.ts";
import { PLANE_ON_PLANE_MOTION } from "./plane-on-plane.ts";

// Registry of alignment motions (ADR 0035 point 9). The rest of the core asks
// this record and never tests a kind by name. A kind declared in the protocol
// without an entry here does not compile.
export const ALIGNMENT_MOTIONS: Readonly<Record<AlignmentKind, AlignmentMotion>> = {
  plane_on_plane: PLANE_ON_PLANE_MOTION,
  axis_on_axis: AXIS_ON_AXIS_MOTION,
  axis_around_pivot: AXIS_AROUND_PIVOT_MOTION,
};
