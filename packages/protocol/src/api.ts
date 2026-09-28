import { z } from "zod";
import {
  BodySchema,
  DisplayNameSchema,
  LengthUnitSchema,
  PantinDocumentSchema,
  PantinIdSchema,
  UpAxisSchema,
} from "./pantin.ts";

// REST contract between the core and its clients (viewer, CLI, tests).
// All routes live under API_PREFIX. Bodies are JSON unless stated otherwise.
//
//   GET    /api/pantins                               -> PantinListResponse
//   POST   /api/pantins              CreatePantinRequest -> 201 PantinResponse
//   GET    /api/pantins/:pantinId                     -> PantinResponse
//   PATCH  /api/pantins/:pantinId    RenameRequest    -> PantinResponse
//   POST   /api/pantins/:pantinId/save                -> PantinResponse
//   POST   /api/pantins/:pantinId/bodies?<ImportBodyQuery>
//          raw file bytes (application/octet-stream)  -> 201 BodyResponse
//   PATCH  /api/pantins/:pantinId/bodies/:bodyId  RenameRequest -> BodyResponse
//   GET    /api/pantins/:pantinId/meshes/:fileName    -> raw mesh bytes
//
// Edits stay in the core's memory until `save` writes pantin.json; imported
// mesh files are written to meshes/ at import time.

export const API_PREFIX = "/api";

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export const CreatePantinRequestSchema = z.object({ name: DisplayNameSchema });
export type CreatePantinRequest = z.infer<typeof CreatePantinRequestSchema>;

export const RenameRequestSchema = z.object({ name: DisplayNameSchema });
export type RenameRequest = z.infer<typeof RenameRequestSchema>;

export const ImportBodyQuerySchema = z.object({
  fileName: z.string().min(1).max(255),
  // Required for STL, which carries no unit. GLB is metres by specification.
  unit: LengthUnitSchema.optional(),
  // Defaults: "y" for GLB (glTF specification), "z" for STL (CAD convention).
  upAxis: UpAxisSchema.optional(),
});
export type ImportBodyQuery = z.infer<typeof ImportBodyQuerySchema>;

export const PantinSummarySchema = z.object({
  id: PantinIdSchema,
  name: DisplayNameSchema,
  bodyCount: z.number().int().nonnegative(),
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

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "conflict",
  "unsupported_file",
  "payload_too_large",
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
