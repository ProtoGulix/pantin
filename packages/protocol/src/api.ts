import { z } from "zod";
import { BodyIdSchema, DisplayNameSchema, JointIdSchema, PantinIdSchema } from "./ids.ts";
import {
  type CreateJointRequest,
  CreateJointRequestSchema,
  JointSchema,
  Vector3Schema,
} from "./joint.ts";
import { BodySchema, LengthUnitSchema, PantinDocumentSchema, UpAxisSchema } from "./pantin.ts";

// REST contract between the core and its clients (viewer, CLI, tests).
// All routes live under API_PREFIX. Bodies are JSON unless stated otherwise.
//
//   GET    /api/pantins                               -> PantinListResponse
//   POST   /api/pantins              CreatePantinRequest -> 201 PantinResponse
//   GET    /api/pantins/:pantinId                     -> PantinResponse
//   PATCH  /api/pantins/:pantinId    RenameRequest    -> PantinResponse
//   POST   /api/pantins/:pantinId/save                -> PantinResponse
//   POST   /api/pantins/:pantinId/discard             -> PantinResponse
//          (throws away unsaved edits: the document is reloaded from
//          pantin.json, meshes imported since the last save are deleted and
//          pending mesh deletions are cancelled)
//   POST   /api/pantins/:pantinId/bodies?<ImportBodyQuery>
//          raw file bytes (application/octet-stream)  -> 201 ImportBodiesResponse
//          (one body for GLB and STL, one body per assembly component for STEP;
//          several components are also joined by fixed joints, ADR 0017)
//   PATCH  /api/pantins/:pantinId/bodies/:bodyId  RenameRequest -> BodyResponse
//   DELETE /api/pantins/:pantinId/bodies/:bodyId  -> PantinResponse
//          (removes the body from the in-memory document: an unsaved change;
//          its mesh file is deleted at once if pantin.json on disk does not
//          reference it, otherwise when the Pantin is saved)
//   GET    /api/pantins/:pantinId/meshes/:fileName    -> raw mesh bytes
//   GET    /api/pantins/:pantinId/joints              -> JointListResponse
//   POST   /api/pantins/:pantinId/joints  CreateJointRequest -> 201 JointResponse
//   PATCH  /api/pantins/:pantinId/joints/:jointId  UpdateJointRequest -> JointResponse
//          (replaces every field but the id, the type included, ADR 0018;
//          a joint that becomes fixed loses its position and setpoint)
//   DELETE /api/pantins/:pantinId/joints/:jointId     -> PantinResponse
//   GET    /api/pantins/:pantinId/pose                -> PoseResponse
//   PUT    /api/pantins/:pantinId/joints/:jointId/position
//          SetJointPositionRequest                    -> PoseResponse
//   GET    /api/pantins/:pantinId/pose/stream         -> text/event-stream
//          (ADR 0015: events named "pose" whose data is a PoseSnapshot, sent
//          on connection then at most every 1/30 s of simulated time when
//          something moved; ": keep-alive" comments every 15 s)
//
// Joints (ADR 0011) are part of the document: creating or deleting one is an
// unsaved change. Joint positions are runtime state held by the core, never
// saved, reset to 0 when a Pantin is opened, and clamped by the core to the
// joint limits. Deleting a body used by a joint answers `conflict`.
//
// Tag routes (ADR 0012) are listed in tag.ts.
//
// Edits stay in the core's memory until `save` writes pantin.json; imported
// mesh files are written to meshes/ at import time. Listing Pantins reads
// their summaries only: it never opens them.

export const API_PREFIX = "/api";

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export const CreatePantinRequestSchema = z.object({ name: DisplayNameSchema });
export type CreatePantinRequest = z.infer<typeof CreatePantinRequestSchema>;

export const RenameRequestSchema = z.object({ name: DisplayNameSchema });
export type RenameRequest = z.infer<typeof RenameRequestSchema>;

export const ImportBodyQuerySchema = z.object({
  fileName: z.string().min(1).max(255),
  // Required for STL, which carries no unit. GLB is metres by specification;
  // STEP declares its unit and is converted to metres.
  unit: LengthUnitSchema.optional(),
  // Defaults: "y" for GLB (glTF specification), "z" for STL and STEP (CAD convention).
  upAxis: UpAxisSchema.optional(),
});
export type ImportBodyQuery = z.infer<typeof ImportBodyQuerySchema>;

export const PantinSummarySchema = z.object({
  id: PantinIdSchema,
  name: DisplayNameSchema,
  bodyCount: z.number().int().nonnegative(),
  // When pantin.json last changed on disk, ISO 8601 (ADR 0027).
  modifiedAt: z.iso.datetime(),
});
export type PantinSummary = z.infer<typeof PantinSummarySchema>;

export const PantinListResponseSchema = z.object({ pantins: z.array(PantinSummarySchema) });
export type PantinListResponse = z.infer<typeof PantinListResponseSchema>;

export const PantinResponseSchema = z.object({
  id: PantinIdSchema,
  // True when the in-memory document differs from pantin.json on disk.
  unsavedChanges: z.boolean(),
  document: PantinDocumentSchema,
});
export type PantinResponse = z.infer<typeof PantinResponseSchema>;

export const BodyResponseSchema = z.object({ body: BodySchema });
export type BodyResponse = z.infer<typeof BodyResponseSchema>;

// The joints link the bodies of a multi-component STEP import (ADR 0017);
// empty for GLB, STL and a single-component STEP file.
export const ImportBodiesResponseSchema = z.object({
  bodies: z.array(BodySchema).min(1),
  joints: z.array(JointSchema),
});
export type ImportBodiesResponse = z.infer<typeof ImportBodiesResponseSchema>;

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "conflict",
  "unsupported_file",
  "payload_too_large",
  // The STEP converter is not installed or not configured on this core.
  "conversion_unavailable",
  // The STEP converter ran but could not convert this file (invalid, empty, too slow).
  "conversion_failed",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    // Actionable, human readable: what was wrong and how to fix it.
    message: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const JointResponseSchema = z.object({ joint: JointSchema });
export type JointResponse = z.infer<typeof JointResponseSchema>;

// The whole joint without its id, as for creation: the id, hence the names of
// its tags, stays the same even when the joint is renamed.
export const UpdateJointRequestSchema = CreateJointRequestSchema;
export type UpdateJointRequest = CreateJointRequest;

export const JointListResponseSchema = z.object({ joints: z.array(JointSchema) });
export type JointListResponse = z.infer<typeof JointListResponseSchema>;

// In the unit of the joint's coordinate (JOINT_COORDINATE_UNITS).
export const SetJointPositionRequestSchema = z.object({
  position: z.number().refine(Number.isFinite, "The position must be a finite number."),
});
export type SetJointPositionRequest = z.infer<typeof SetJointPositionRequestSchema>;

// Unit quaternion [x, y, z, w].
export const QuaternionSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Quaternion = z.infer<typeof QuaternionSchema>;

// Rigid transform to apply to a body's mesh as its file places it (ADR 0033
// point 5): its joint displacement composed with the world placement of its
// assembly. In the Pantin frame: first rotate by `rotation` about the Pantin
// origin, then translate by `translation` (metres).
export const BodyPoseSchema = z.object({
  bodyId: BodyIdSchema,
  translation: Vector3Schema,
  rotation: QuaternionSchema,
});
export type BodyPose = z.infer<typeof BodyPoseSchema>;

export const JointPositionSchema = z.object({ jointId: JointIdSchema, position: z.number() });
export type JointPosition = z.infer<typeof JointPositionSchema>;

// Every body of the Pantin is listed; a body without a parent joint has the
// identity displacement.
export const PoseResponseSchema = z.object({
  jointPositions: z.array(JointPositionSchema),
  bodies: z.array(BodyPoseSchema),
});
export type PoseResponse = z.infer<typeof PoseResponseSchema>;

// One event of the pose stream (ADR 0015).
export const PoseSnapshotSchema = PoseResponseSchema.extend({
  // Simulation steps run since the Pantin was opened.
  stepCount: z.number().int().nonnegative(),
});
export type PoseSnapshot = z.infer<typeof PoseSnapshotSchema>;

export const POSE_STREAM_EVENT_NAME = "pose";
// The second event of the stream, carrying a SimulationClockState (ADR 0032 point 9).
export const CLOCK_STREAM_EVENT_NAME = "clock";
