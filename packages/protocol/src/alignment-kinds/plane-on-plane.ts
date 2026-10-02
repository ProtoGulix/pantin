import { type AlignmentKindDescriptor, alignmentRequestSchema } from "./common.ts";

// "Plan sur plan" (ADR 0035 point 5): the moving plane faces the target plane,
// at the offset from it; nothing is centred.
export const PLANE_ON_PLANE: AlignmentKindDescriptor = {
  picks: [
    { side: "moving", face: "plane", fallback: true },
    { side: "target", face: "plane", fallback: true },
  ],
  parameters: ["flip", "offset", "rotation"],
};

export const PlaneOnPlaneRequestSchema = alignmentRequestSchema("plane_on_plane", PLANE_ON_PLANE);
