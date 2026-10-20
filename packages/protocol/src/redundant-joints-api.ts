import { z } from "zod";
import { PantinResponseSchema } from "./api.ts";
import { DeletedJointSchema } from "./assembly-api.ts";
import { DisplayNameSchema, JointIdSchema, KeySchema } from "./ids.ts";

// Deleting the fixed joints that groups made redundant (ADR 0060), under
// API_PREFIX:
//
//   GET  /api/pantins/:pantinId/redundant-joints  -> RedundantJointsList
//        (the preview: changes nothing; 404 for an unknown Pantin)
//   POST /api/pantins/:pantinId/redundant-joints/delete
//        RedundantJointsDeletionRequest -> RedundantJointsDeletionResponse
//        (the core recomputes the criterion and deletes only the ids that are
//        both requested and still redundant, in one validated document
//        replacement; 400 for an invalid body)
//
// These routes are not under `.../joints/` because `DELETE .../joints/:jointId`
// would match a joint whose id is "redundant".

export const MAX_REDUNDANT_JOINT_DELETIONS_PER_REQUEST = 1000;

export const ListedJointSchema = z.object({
  id: JointIdSchema,
  name: DisplayNameSchema,
  assembly: z.object({ key: KeySchema, name: DisplayNameSchema }),
});
export type ListedJoint = z.infer<typeof ListedJointSchema>;

// Why a fixed joint inside an assembly stays: a moving joint up its parent's
// chain, or an actuator, sensor or belt that relies on it.
export const KeptJointReasonSchema = z.enum(["moving_parent", "in_use"]);
export type KeptJointReason = z.infer<typeof KeptJointReasonSchema>;

export const KeptJointSchema = ListedJointSchema.extend({
  reason: KeptJointReasonSchema,
  by: z.object({
    kind: z.enum(["joint", "actuator", "sensor", "belt"]),
    id: z.string(),
    name: DisplayNameSchema,
  }),
});
export type KeptJoint = z.infer<typeof KeptJointSchema>;

// Both lists are sorted by assembly name, then joint name.
export const RedundantJointsListSchema = z.object({
  redundant: z.array(ListedJointSchema),
  kept: z.array(KeptJointSchema),
});
export type RedundantJointsList = z.infer<typeof RedundantJointsListSchema>;

export const RedundantJointsDeletionRequestSchema = z.object({
  jointIds: z.array(JointIdSchema).min(1).max(MAX_REDUNDANT_JOINT_DELETIONS_PER_REQUEST),
});
export type RedundantJointsDeletionRequest = z.infer<typeof RedundantJointsDeletionRequestSchema>;

// `skipped`: requested ids that are no longer redundant, or not there.
export const RedundantJointsDeletionResponseSchema = z.object({
  pantin: PantinResponseSchema,
  deletedJoints: z.array(DeletedJointSchema),
  skipped: z.array(z.string()),
});
export type RedundantJointsDeletionResponse = z.infer<typeof RedundantJointsDeletionResponseSchema>;
