import { z } from "zod";
import {
  AXIS_AROUND_PIVOT,
  AxisAroundPivotRequestSchema,
} from "./alignment-kinds/axis-around-pivot.ts";
import { AXIS_ON_AXIS, AxisOnAxisRequestSchema } from "./alignment-kinds/axis-on-axis.ts";
import type { AlignmentKindDescriptor } from "./alignment-kinds/common.ts";
import { PLANE_ON_PLANE, PlaneOnPlaneRequestSchema } from "./alignment-kinds/plane-on-plane.ts";
import { AssemblyPlacementResponseSchema } from "./assembly-api.ts";

// Alignment by picked faces (ADR 0035):
//
//   POST /api/pantins/:pantinId/assemblies/:assemblyKey/align
//        AlignRequest -> AlignResponse
//
// The assembly moves by one rigid motion computed by the core in the
// configuration on screen; only its resulting placement is stored.
//
// Registry of alignment kinds (ADR 0035 point 9). Each kind lives in
// alignment-kinds/<kind>.ts; adding one means listing its request schema
// below and its descriptor in the record (the compiler asks for it), then
// its motion in the core. Steps: docs/guides/adding-an-alignment-kind.md.

export {
  type AlignmentKindDescriptor,
  type AlignmentParameter,
  type AlignmentPick,
  type AlignmentPickRole,
  AlignmentPickSchema,
  type AlignmentSide,
} from "./alignment-kinds/common.ts";

export const AlignRequestSchema = z.discriminatedUnion("kind", [
  PlaneOnPlaneRequestSchema,
  AxisOnAxisRequestSchema,
  AxisAroundPivotRequestSchema,
]);
export type AlignRequest = z.infer<typeof AlignRequestSchema>;
export type AlignmentKind = AlignRequest["kind"];

export const ALIGNMENT_KINDS: Readonly<Record<AlignmentKind, AlignmentKindDescriptor>> = {
  plane_on_plane: PLANE_ON_PLANE,
  axis_on_axis: AXIS_ON_AXIS,
  axis_around_pivot: AXIS_AROUND_PIVOT,
};

// The placement response of ADR 0033 point 8, plus whether a target body is
// displaced by a joint: then the alignment holds only at this position
// unless the moving assembly follows the target (ADR 0035 point 6).
export const AlignResponseSchema = AssemblyPlacementResponseSchema.extend({
  targetDisplaced: z.boolean(),
});
export type AlignResponse = z.infer<typeof AlignResponseSchema>;
