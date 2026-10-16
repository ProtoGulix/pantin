import { z } from "zod";
import { KeySchema } from "./ids.ts";
import { TagNameSchema } from "./tag.ts";

// io.json, the I/O mapping of a Pantin (ADR 0049): one file beside pantin.json
// that links tags to CODESYS variables and Modbus addresses and holds the
// settings of each Modbus module. It defines no tag: the document does. A
// public schema like pantin.json's (ADR 0021), so a change bumps
// `schema_version` with a migration (CLAUDE.md 14.6).
//
// The canonical text (2-space indentation, final newline, channels sorted by
// zone, address, tag) is written by the core: this package holds no logic.

export const IO_JSON_FILE_NAME = "io.json";
export const IO_SCHEMA_VERSION = 1;
// A mapping is a small table; a larger file is refused rather than read.
export const IO_FILE_MAX_BYTES = 1024 * 1024;
export const MODBUS_MAX_ADDRESS = 65535;

// The order of the zones is also the order of the channels in the canonical text.
export const IO_ZONES = ["coil", "discrete_input", "holding_register", "input_register"] as const;
export const IoZoneSchema = z.enum(IO_ZONES);
export type IoZone = z.infer<typeof IoZoneSchema>;

// The PLC-side type of a mapped tag: BOOL in a bit zone, REAL (IEEE 754
// single) and DINT over two registers in a register zone.
export const IO_TYPES = ["BOOL", "REAL", "DINT"] as const;
export const IoTypeSchema = z.enum(IO_TYPES);
export type IoType = z.infer<typeof IoTypeSchema>;

export const WordOrderSchema = z.enum(["low_word_first", "high_word_first"]);
export type WordOrder = z.infer<typeof WordOrderSchema>;

// Unit id 1..247: the slave addresses of the Modbus over Serial Line
// specification (0 is broadcast, 248..255 reserved), which Modbus TCP keeps in
// its unit identifier field. NOT VERIFIED: recalled, not read for this ADR,
// and a CODESYS master may send another value (spike 4b).
export const MODBUS_UNIT_ID_RANGE = { min: 1, max: 247 } as const;
// Below 100 ms a normal PLC poll (20 to 50 ms, ADR 0045 spike 0003) would
// trip the watchdog on one late request; an hour is the generous end.
export const WATCHDOG_MILLISECONDS_RANGE = { min: 100, max: 3_600_000 } as const;

// The fields of a module's settings without their defaults, shared with the
// edit requests (io-requests.ts), where an absent field means "unchanged".
export const IoPortSchema = z.number().int().min(1024).max(65535);
export const IoUnitIdSchema = z
  .number()
  .int()
  .min(MODBUS_UNIT_ID_RANGE.min)
  .max(MODBUS_UNIT_ID_RANGE.max);
export const IoWatchdogSchema = z
  .number()
  .int()
  .min(WATCHDOG_MILLISECONDS_RANGE.min)
  .max(WATCHDOG_MILLISECONDS_RANGE.max);

export const IoModuleSettingsSchema = z.strictObject({
  key: KeySchema,
  port: IoPortSchema,
  unitId: IoUnitIdSchema.default(MODBUS_UNIT_ID_RANGE.min),
  wordOrder: WordOrderSchema.default("low_word_first"),
  watchdogMilliseconds: IoWatchdogSchema.default(1000),
});
export type IoModuleSettings = z.infer<typeof IoModuleSettingsSchema>;

// `zone` and `ioType` could be derived from the tag but are stored: io.json is
// the contract with the PLC program, so a document change that alters a tag
// shows as a problem instead of silently moving a channel (ADR 0049 point 1).
// `variable` is free text here: its CODESYS rules are problems, not syntax.
export const IoChannelSchema = z.strictObject({
  tag: TagNameSchema,
  variable: z.string(),
  zone: IoZoneSchema,
  address: z.number().int().min(0).max(MODBUS_MAX_ADDRESS),
  ioType: IoTypeSchema,
  comment: z.string(),
});
export type IoChannel = z.infer<typeof IoChannelSchema>;

export const IoModuleSchema = IoModuleSettingsSchema.extend({
  channels: z.array(IoChannelSchema),
});
export type IoModule = z.infer<typeof IoModuleSchema>;

export const IoDocumentSchema = z
  .strictObject({
    schema_version: z.literal(IO_SCHEMA_VERSION),
    modules: z.array(IoModuleSchema),
  })
  .superRefine((document, context) => {
    const keys = new Set<string>();
    const ports = new Set<number>();
    const tags = new Set<string>();
    document.modules.forEach((module, moduleIndex) => {
      if (keys.has(module.key)) {
        context.addIssue({
          code: "custom",
          path: ["modules", moduleIndex, "key"],
          message: `Module key "${module.key}" is used twice.`,
        });
      }
      if (ports.has(module.port)) {
        context.addIssue({
          code: "custom",
          path: ["modules", moduleIndex, "port"],
          message: `Port ${module.port} is used by two modules: each module listens on its own port.`,
        });
      }
      keys.add(module.key);
      ports.add(module.port);
      module.channels.forEach((channel, channelIndex) => {
        if (tags.has(channel.tag)) {
          context.addIssue({
            code: "custom",
            path: ["modules", moduleIndex, "channels", channelIndex, "tag"],
            message: `Tag "${channel.tag}" is mapped twice: a tag is mapped once.`,
          });
        }
        tags.add(channel.tag);
      });
    });
  });
export type IoDocument = z.infer<typeof IoDocumentSchema>;
