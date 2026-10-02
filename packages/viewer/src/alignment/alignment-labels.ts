import type { AlignmentKind } from "@pantin/protocol";
import type { MessageKey } from "../i18n/translate.ts";
import type { PickRefusal } from "./pick-resolution.ts";

// Words of the alignment panel (ADR 0035). Typed on the protocol's kinds: a
// new kind does not compile until it has its name and one label per pick.

// The order of the kinds in the panel; their names below are required per kind.
export const ALIGNMENT_KIND_ORDER = [
  "plane_on_plane",
  "axis_on_axis",
  "axis_around_pivot",
] as const satisfies readonly AlignmentKind[];

export const ALIGNMENT_KIND_LABELS = {
  plane_on_plane: "alignment.kind.plane_on_plane",
  axis_on_axis: "alignment.kind.axis_on_axis",
  axis_around_pivot: "alignment.kind.axis_around_pivot",
} as const satisfies Record<AlignmentKind, MessageKey>;

export const ALIGNMENT_PICK_LABELS = {
  plane_on_plane: ["alignment.pick.plane_on_plane.0", "alignment.pick.plane_on_plane.1"],
  axis_on_axis: ["alignment.pick.axis_on_axis.0", "alignment.pick.axis_on_axis.1"],
  axis_around_pivot: [
    "alignment.pick.axis_around_pivot.0",
    "alignment.pick.axis_around_pivot.1",
    "alignment.pick.axis_around_pivot.2",
  ],
} as const satisfies Record<AlignmentKind, readonly MessageKey[]>;

export const PICK_REFUSAL_MESSAGES = {
  allPicked: "alignment.refusal.allPicked",
  mustBeMoving: "alignment.refusal.mustBeMoving",
  mustBeTarget: "alignment.refusal.mustBeTarget",
  needsPlane: "alignment.refusal.needsPlane",
  needsCylinder: "alignment.refusal.needsCylinder",
  noFaceFile: "alignment.refusal.noFaceFile",
  unmappedFace: "alignment.refusal.unmappedFace",
} as const satisfies Record<PickRefusal, MessageKey>;
