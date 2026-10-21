import { TRANSPORT_PROBLEM_CODES } from "@pantin/transport-types/schemas";
import { z } from "zod";
import { IoChannelSchema, IoModuleSchema } from "./io-document.ts";
import { TagDirectionSchema, TagNameSchema, TagTypeSchema } from "./tag.ts";

// The answer of GET /api/pantins/:pantinId/io (ADR 0049 points 5 to 8, ADR 0064
// point 6, version 2 of io.json): the
// open mapping, checked against the open document's tags. It mirrors io.json,
// each channel annotated with what the document says of its tag.
//
//   GET /api/pantins/:pantinId/io  -> IoMappingResponse

export const IoStatusSchema = z.enum(["valid", "invalid", "missing"]);
export type IoStatus = z.infer<typeof IoStatusSchema>;

// The codes every transport shares; each transport adds its own (ADR 0064 point 5).
export const IO_COMMON_PROBLEM_CODES = [
  "file_too_large",
  "invalid_encoding",
  "invalid_json",
  "unreadable_file",
  "schema_invalid",
  "newer_schema_version",
  "unknown_tag",
  "command_mapped_twice",
  "unsupported_signal",
  "listen_port_used_twice",
  "invalid_variable",
  "duplicate_variable",
] as const;
export const IO_PROBLEM_CODES = [...IO_COMMON_PROBLEM_CODES, ...TRANSPORT_PROBLEM_CODES] as const;
export const IoProblemCodeSchema = z.enum(IO_PROBLEM_CODES);
export type IoProblemCode = z.infer<typeof IoProblemCodeSchema>;

// The JSON path into io.json, as in a Zod issue (for example
// ["modules", 0, "channels", 3, "address"]); [] means the whole file.
export const IoPathSchema = z.array(z.union([z.string(), z.number().int().min(0)]));
export type IoPath = z.infer<typeof IoPathSchema>;

export const IoProblemSchema = z.object({
  path: IoPathSchema,
  code: IoProblemCodeSchema,
  message: z.string(),
});
export type IoProblem = z.infer<typeof IoProblemSchema>;

// The element that owns a tag, as tag-entries.ts names the kinds.
export const TAG_OWNER_KINDS = ["joint", "drive", "sensor", "emitter", "presenceSensor"] as const;
export const IoTagOwnerSchema = z.object({
  kind: z.enum(TAG_OWNER_KINDS),
  id: z.string(),
});
export type IoTagOwner = z.infer<typeof IoTagOwnerSchema>;

// A channel with what the document says of its tag: all null for an unknown
// tag (the channel is then also a problem).
export const IoMappedChannelSchema = z.object({
  ...IoChannelSchema.shape,
  tagType: TagTypeSchema.nullable(),
  direction: TagDirectionSchema.nullable(),
  owner: IoTagOwnerSchema.nullable(),
});
export type IoMappedChannel = z.infer<typeof IoMappedChannelSchema>;

export const IoMappingModuleSchema = z.strictObject({
  ...IoModuleSchema.shape,
  channels: z.array(IoMappedChannelSchema),
});
export type IoMappingModule = z.infer<typeof IoMappingModuleSchema>;

export const IoUnmappedTagSchema = z.object({
  name: TagNameSchema,
  type: TagTypeSchema,
  direction: TagDirectionSchema,
  owner: IoTagOwnerSchema,
});
export type IoUnmappedTag = z.infer<typeof IoUnmappedTagSchema>;

export const IoMappingResponseSchema = z.object({
  status: IoStatusSchema,
  // SHA-256 (hex) of the canonical text of the open mapping; null when it is
  // missing or unreadable. The bridge sends it in `hello`; the core compares
  // it with the open mapping and refuses another id (close code 4003).
  mappingId: z.string().nullable(),
  // Empty when the mapping is missing or unreadable.
  modules: z.array(IoMappingModuleSchema),
  problems: z.array(IoProblemSchema),
  // Tags of the document that no channel maps: a warning, not a problem.
  unmappedTags: z.array(IoUnmappedTagSchema),
});
export type IoMappingResponse = z.infer<typeof IoMappingResponseSchema>;
