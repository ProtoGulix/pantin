import { type AlignmentKindDescriptor, alignmentRequestSchema } from "./common.ts";

// "Axe sur axe autour d'un pivot" (ADR 0035 point 5): a rotation about a
// pivot axis on the target only, bringing a moving hole onto a target hole.
// Picks: the pivot, the moving hole, the target hole.
export const AXIS_AROUND_PIVOT: AlignmentKindDescriptor = {
  picks: [
    { side: "target", face: "cylinder", fallback: false },
    { side: "moving", face: "cylinder", fallback: false },
    { side: "target", face: "cylinder", fallback: false },
  ],
  parameters: ["rotation"],
};

export const AxisAroundPivotRequestSchema = alignmentRequestSchema(
  "axis_around_pivot",
  AXIS_AROUND_PIVOT,
);
