import { z } from "zod";
import { KeySchema } from "./ids.ts";
import {
  IoPortSchema,
  IoUnitIdSchema,
  IoWatchdogSchema,
  MODBUS_MAX_ADDRESS,
  WordOrderSchema,
} from "./io-document.ts";
import { TagNameSchema } from "./tag.ts";

// The bodies of the I/O mapping edit routes (ADR 0049 point 4). Every answer is
// the whole IoMappingResponse. The client never sends a zone or a PLC type:
// the core derives them from the tag.
//
//   POST   /api/pantins/:pantinId/io/modules                        CreateIoModuleRequest
//   PATCH  /api/pantins/:pantinId/io/modules/:moduleKey             UpdateIoModuleRequest
//   DELETE /api/pantins/:pantinId/io/modules/:moduleKey
//   POST   /api/pantins/:pantinId/io/modules/:moduleKey/channels    CreateIoChannelsRequest
//   PATCH  /api/pantins/:pantinId/io/channels/:tag                  UpdateIoChannelRequest
//   DELETE /api/pantins/:pantinId/io/channels/:tag

// Absent settings take the key, port and defaults the core proposes.
export const CreateIoModuleRequestSchema = z.strictObject({
  port: IoPortSchema.optional(),
  unitId: IoUnitIdSchema.optional(),
  wordOrder: WordOrderSchema.optional(),
  watchdogMilliseconds: IoWatchdogSchema.optional(),
});
export type CreateIoModuleRequest = z.infer<typeof CreateIoModuleRequestSchema>;

export const UpdateIoModuleRequestSchema = CreateIoModuleRequestSchema.extend({
  key: KeySchema.optional(),
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

// `tag` re-derives zone and ioType even when unchanged; `module` moves the channel.
export const UpdateIoChannelRequestSchema = z.strictObject({
  tag: TagNameSchema.optional(),
  variable: z.string().optional(),
  address: z.number().int().min(0).max(MODBUS_MAX_ADDRESS).optional(),
  comment: z.string().optional(),
  module: KeySchema.optional(),
});
export type UpdateIoChannelRequest = z.infer<typeof UpdateIoChannelRequestSchema>;
