import { z } from "zod";
import { PantinResponseSchema } from "./api.ts";
import { KeySchema } from "./ids.ts";
import { TagNameSchema } from "./tag.ts";

// Assemblies and keys (ADR 0019), under API_PREFIX:
//
//   POST   /api/pantins/:pantinId/assemblies  RenameRequest -> 201 PantinResponse
//          (a new empty assembly; its key comes from the name)
//   PATCH  /api/pantins/:pantinId/assemblies/:assemblyKey  RenameRequest
//          -> PantinResponse (the display name only: no tag changes)
//   DELETE /api/pantins/:pantinId/assemblies/:assemblyKey  -> PantinResponse
//          (409 while the assembly holds bodies)
//   PUT    /api/pantins/:pantinId/assemblies/:assemblyKey/key  RenameKeyRequest
//          -> RenamedTagsResponse
//   PUT    /api/pantins/:pantinId/joints/:jointId/tag-key  RenameTagKeyRequest
//          -> RenamedTagsResponse
//   PUT    /api/pantins/:pantinId/bodies/:bodyId/assembly  MoveBodyRequest
//          -> RenamedTagsResponse
//
// Keys change only through these routes, so tags change only when asked. A
// key already taken is refused (409) with a free alternative in the message.

export const RenameKeyRequestSchema = z.object({ key: KeySchema });
export type RenameKeyRequest = z.infer<typeof RenameKeyRequestSchema>;

export const RenameTagKeyRequestSchema = z.object({ tagKey: KeySchema });
export type RenameTagKeyRequest = z.infer<typeof RenameTagKeyRequestSchema>;

export const MoveBodyRequestSchema = z.object({ assembly: KeySchema });
export type MoveBodyRequest = z.infer<typeof MoveBodyRequestSchema>;

export const RenamedTagSchema = z.object({ from: TagNameSchema, to: TagNameSchema });
export type RenamedTag = z.infer<typeof RenamedTagSchema>;

// The Pantin after the change, and every tag whose name changed with it, so
// that a client can show the user what the PLC side must follow.
export const RenamedTagsResponseSchema = z.object({
  pantin: PantinResponseSchema,
  renamedTags: z.array(RenamedTagSchema),
});
export type RenamedTagsResponse = z.infer<typeof RenamedTagsResponseSchema>;
