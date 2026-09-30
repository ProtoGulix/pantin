import { z } from "zod";
import { CreateDriveRequestSchema, DriveSchema } from "./drive.ts";
import { DriveIdSchema, JointIdSchema } from "./ids.ts";

// Drives and faults (ADR 0022), under API_PREFIX:
//
//   POST   /api/pantins/:pantinId/drives  CreateDriveRequest -> 201 DriveResponse
//   PATCH  /api/pantins/:pantinId/drives/:driveId  UpdateDriveRequest -> DriveResponse
//          (every field but the id and the tag key; the type may change)
//   DELETE /api/pantins/:pantinId/drives/:driveId  -> PantinResponse
//   PUT    /api/pantins/:pantinId/drives/:driveId/tag-key  RenameTagKeyRequest
//          -> RenamedTagsResponse
//   GET    /api/pantins/:pantinId/faults  -> FaultsResponse
//   PUT    /api/pantins/:pantinId/joints/:jointId/fault  JointFaultRequest -> FaultsResponse
//   PUT    /api/pantins/:pantinId/drives/:driveId/fault  DriveFaultRequest -> FaultsResponse
//
// A drive's command tags are written like any tag (tag.ts); a bit takes 0 or
// 1. Faults are runtime state: never saved, cleared when a Pantin is opened.

export const DriveResponseSchema = z.object({ drive: DriveSchema });
export type DriveResponse = z.infer<typeof DriveResponseSchema>;

// The whole drive without its id and tag key, as for creation.
export const UpdateDriveRequestSchema = CreateDriveRequestSchema;
export type UpdateDriveRequest = z.infer<typeof UpdateDriveRequestSchema>;

// Jammed (grippé): the joint keeps its position whatever drives it.
export const JointFaultRequestSchema = z.object({ fault: z.enum(["none", "jammed"]) });
export type JointFaultRequest = z.infer<typeof JointFaultRequestSchema>;

// Unresponsive (ne répond plus): the drive keeps its last commands and its
// feedback freezes, like a lost fieldbus module.
export const DriveFaultRequestSchema = z.object({ fault: z.enum(["none", "unresponsive"]) });
export type DriveFaultRequest = z.infer<typeof DriveFaultRequestSchema>;

export const FaultsResponseSchema = z.object({
  jammedJoints: z.array(JointIdSchema),
  unresponsiveDrives: z.array(DriveIdSchema),
});
export type FaultsResponse = z.infer<typeof FaultsResponseSchema>;
