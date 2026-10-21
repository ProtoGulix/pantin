import {
  CHANNEL_PATCH_TRANSPORT_SHAPE,
  TransportPatchSchema,
} from "@pantin/transport-types/schemas";
import { z } from "zod";
import { KeySchema } from "./ids.ts";
import { TagNameSchema } from "./tag.ts";

// The bodies of the I/O mapping edit routes (ADR 0049 point 4, ADR 0064 point 6).
// Every answer is the whole IoMappingResponse. The client never sends a zone or
// a PLC type: the core derives what the transport needs from the tag.
//
//   POST   /api/pantins/:pantinId/io/modules                                  CreateIoModuleRequest
//   PATCH  /api/pantins/:pantinId/io/modules/:moduleKey                       UpdateIoModuleRequest
//   DELETE /api/pantins/:pantinId/io/modules/:moduleKey
//   POST   /api/pantins/:pantinId/io/modules/:moduleKey/channels              CreateIoChannelsRequest
//   PATCH  /api/pantins/:pantinId/io/modules/:moduleKey/channels/:tag         UpdateIoChannelRequest
//   DELETE /api/pantins/:pantinId/io/modules/:moduleKey/channels/:tag

// Absent settings take the key, port and defaults the core proposes.
export const CreateIoModuleRequestSchema = z.strictObject({
  key: KeySchema.optional(),
  transport: TransportPatchSchema,
});
export type CreateIoModuleRequest = z.infer<typeof CreateIoModuleRequestSchema>;

// Another `kind` than the module's is refused by the core: a module keeps its transport.
export const UpdateIoModuleRequestSchema = z.strictObject({
  key: KeySchema.optional(),
  transport: TransportPatchSchema.optional(),
});
export type UpdateIoModuleRequest = z.infer<typeof UpdateIoModuleRequestSchema>;

export const CreateIoChannelsRequestSchema = z.strictObject({
  tags: z
    .array(TagNameSchema)
    .min(1)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "A tag appears twice in the request: list each tag once.",
    }),
});
export type CreateIoChannelsRequest = z.infer<typeof CreateIoChannelsRequestSchema>;

// `tag` re-derives the transport fields even when unchanged; `module` moves the channel.
export const UpdateIoChannelRequestSchema = z.strictObject({
  tag: TagNameSchema.optional(),
  variable: z.string().optional(),
  comment: z.string().optional(),
  module: KeySchema.optional(),
  ...CHANNEL_PATCH_TRANSPORT_SHAPE,
});
export type UpdateIoChannelRequest = z.infer<typeof UpdateIoChannelRequestSchema>;
