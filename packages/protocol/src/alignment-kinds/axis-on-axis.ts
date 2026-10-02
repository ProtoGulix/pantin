import { type AlignmentKindDescriptor, alignmentRequestSchema } from "./common.ts";

// "Axe sur axe" (ADR 0035 point 5): the moving axis lies on the target axis,
// the axial position kept.
export const AXIS_ON_AXIS: AlignmentKindDescriptor = {
  picks: [
    { side: "moving", face: "cylinder", fallback: false },
    { side: "target", face: "cylinder", fallback: false },
  ],
  parameters: ["flip", "offset", "rotation"],
};

export const AxisOnAxisRequestSchema = alignmentRequestSchema("axis_on_axis", AXIS_ON_AXIS);
