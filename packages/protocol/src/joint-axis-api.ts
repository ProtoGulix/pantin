import { z } from "zod";
import { BodyIdSchema } from "./ids.ts";
import { Vector3Schema } from "./joint.ts";

// Joint axis from a picked face (ADR 0041):
//
//   POST /api/pantins/:pantinId/joints/:jointId/axis-from-face
//        JointAxisFromFaceRequest -> JointAxisFromFaceResponse
//
// The core takes the geometry of the picked face (cylinder: its axis, origin
// on it at the hit point; plane: outward normal, origin at the hit point) to
// the Pantin frame with the body's current pose, then into the frame of the
// joint's parent body's assembly, where a joint's origin and axis are read
// (ADR 0033 point 3). Components within 1e-9 of 0, 1 or -1 are snapped to
// them. It does not modify the document: the client shows the result in the
// joint form, which saves it like any edit.
//
// Any body can be picked, not only those of the joint. Refusals: `not_found`
// (unknown joint, body or face), `invalid_request` (the body has no face
// file, or the face is neither a cylinder nor a plane; the message says
// which and what to do).
//
// `hitPoint` is in metres, in the Pantin frame as displayed, like the points
// of an alignment pick. `origin` is in the unit of joint origins (metres).

export const JointAxisFromFaceRequestSchema = z.object({
  bodyId: BodyIdSchema,
  faceIndex: z.number().int().nonnegative(),
  hitPoint: Vector3Schema,
});
export type JointAxisFromFaceRequest = z.infer<typeof JointAxisFromFaceRequestSchema>;

export const JointAxisFromFaceResponseSchema = z.object({
  origin: Vector3Schema,
  axis: Vector3Schema,
});
export type JointAxisFromFaceResponse = z.infer<typeof JointAxisFromFaceResponseSchema>;
