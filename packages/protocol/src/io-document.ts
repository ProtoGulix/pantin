import {
  CHANNEL_KEY_BY_KIND,
  CHANNEL_KEYS,
  CHANNEL_TRANSPORT_SHAPE,
  TransportConfigSchema,
} from "@pantin/transport-types/schemas";
import { z } from "zod";
import { KeySchema } from "./ids.ts";
import { TagNameSchema } from "./tag.ts";

// io.json, the I/O mapping of a Pantin (ADR 0049, ADR 0064): one file beside
// pantin.json that links tags to PLC variables and to what a transport needs
// (a Modbus zone and address, for example), and holds the settings of each
// module. It defines no tag: the document does. A public schema like
// pantin.json's (ADR 0021), so a change bumps `schema_version` with a
// migration (CLAUDE.md 14.6): version 1 files migrate on read in the core.
//
// A module is `{ key, transport, channels }`. The transport is a union on its
// `kind`, and each channel carries the sub-object of its module's transport.
// The schemas of the transports live in @pantin/transport-types, one folder
// each; this file only assembles them.
//
// The canonical text (2-space indentation, final newline, channels sorted by
// the transport's key) is written by the core: this package holds no logic.

export * from "@pantin/transport-types/schemas";

export const IO_JSON_FILE_NAME = "io.json";
export const IO_SCHEMA_VERSION = 2;
// A mapping is a small table; a larger file is refused rather than read.
export const IO_FILE_MAX_BYTES = 1024 * 1024;

// `variable` is free text here: its CODESYS rules are problems, not syntax.
export const IoChannelSchema = z.strictObject({
  tag: TagNameSchema,
  variable: z.string(),
  comment: z.string(),
  ...CHANNEL_TRANSPORT_SHAPE,
});
export type IoChannel = z.infer<typeof IoChannelSchema>;

export const IoModuleSchema = z.strictObject({
  key: KeySchema,
  transport: TransportConfigSchema,
  channels: z.array(IoChannelSchema),
});
export type IoModule = z.infer<typeof IoModuleSchema>;

// A channel carries exactly the sub-object of its module's transport.
function checkChannelSubObjects(
  module: IoModule,
  moduleIndex: number,
  context: z.RefinementCtx,
): void {
  const expected = CHANNEL_KEY_BY_KIND[module.transport.kind];
  module.channels.forEach((channel, channelIndex) => {
    const path = ["modules", moduleIndex, "channels", channelIndex];
    if (channel[expected] === undefined) {
      context.addIssue({
        code: "custom",
        path: [...path, expected],
        message: `Channel "${channel.tag}" is in a ${module.transport.kind} module: it needs a "${expected}" object.`,
      });
    }
    for (const other of CHANNEL_KEYS.filter((key) => key !== expected)) {
      if (channel[other] !== undefined) {
        context.addIssue({
          code: "custom",
          path: [...path, other],
          message: `Channel "${channel.tag}" is in a ${module.transport.kind} module: it must not carry a "${other}" object.`,
        });
      }
    }
  });
}

// A tag is mapped once per module: a feedback may be read through several
// modules (one per transport), a command is checked across modules by the core.
function checkTagsOncePerModule(
  module: IoModule,
  moduleIndex: number,
  context: z.RefinementCtx,
): void {
  const tags = new Set<string>();
  module.channels.forEach((channel, channelIndex) => {
    if (tags.has(channel.tag)) {
      context.addIssue({
        code: "custom",
        path: ["modules", moduleIndex, "channels", channelIndex, "tag"],
        message: `Tag "${channel.tag}" is mapped twice in module "${module.key}": a tag is mapped once per module.`,
      });
    }
    tags.add(channel.tag);
  });
}

export const IoDocumentSchema = z
  .strictObject({
    schema_version: z.literal(IO_SCHEMA_VERSION),
    modules: z.array(IoModuleSchema),
  })
  .superRefine((document, context) => {
    const keys = new Set<string>();
    document.modules.forEach((module, moduleIndex) => {
      if (keys.has(module.key)) {
        context.addIssue({
          code: "custom",
          path: ["modules", moduleIndex, "key"],
          message: `Module key "${module.key}" is used twice.`,
        });
      }
      keys.add(module.key);
      checkChannelSubObjects(module, moduleIndex, context);
      checkTagsOncePerModule(module, moduleIndex, context);
    });
  });
export type IoDocument = z.infer<typeof IoDocumentSchema>;
