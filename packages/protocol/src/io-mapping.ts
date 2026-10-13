import { z } from "zod";
import { KeySchema } from "./ids.ts";
import { TagDirectionSchema, TagNameSchema, TagTypeSchema } from "./tag.ts";

// The I/O mapping of a Pantin (ADR 0045 points 6 to 8): `io.csv` links tags to
// CODESYS variables and Modbus addresses, `io-modules.json` holds the settings
// of each Modbus module. Neither file defines a tag: the document does.
//
//   GET /api/pantins/:pantinId/io  -> IoMappingResponse
//
// The CSV has no schema here: its parser is hand written (core/src/domain/
// io-list.ts). What crosses the API and the bridge's boundary is below.

export const IO_LIST_FILE_NAME = "io.csv";
export const IO_MODULES_FILE_NAME = "io-modules.json";
// The first line of io.csv, exactly: it is also the version of the format.
export const IO_LIST_HEADER = "tag;variable;module;zone;address;type;comment";
export type IoFileName = typeof IO_LIST_FILE_NAME | typeof IO_MODULES_FILE_NAME;
// Both files are small tables; a larger one is refused rather than read.
export const IO_FILE_MAX_BYTES = 1024 * 1024;
export const MODBUS_MAX_ADDRESS = 65535;

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

export const IoModuleSchema = z.strictObject({
  key: KeySchema,
  port: z.number().int().min(1024).max(65535),
  unitId: z
    .number()
    .int()
    .min(MODBUS_UNIT_ID_RANGE.min)
    .max(MODBUS_UNIT_ID_RANGE.max)
    .default(MODBUS_UNIT_ID_RANGE.min),
  wordOrder: WordOrderSchema.default("low_word_first"),
  watchdogMilliseconds: z
    .number()
    .int()
    .min(WATCHDOG_MILLISECONDS_RANGE.min)
    .max(WATCHDOG_MILLISECONDS_RANGE.max)
    .default(1000),
});
export type IoModule = z.infer<typeof IoModuleSchema>;

export const IoModulesFileSchema = z
  .strictObject({
    schema_version: z.literal(1),
    modules: z.array(IoModuleSchema),
  })
  .superRefine((file, context) => {
    const keys = new Set<string>();
    const ports = new Set<number>();
    file.modules.forEach((module, index) => {
      if (keys.has(module.key)) {
        context.addIssue({
          code: "custom",
          path: ["modules", index, "key"],
          message: `Module key "${module.key}" is used twice.`,
        });
      }
      if (ports.has(module.port)) {
        context.addIssue({
          code: "custom",
          path: ["modules", index, "port"],
          message: `Port ${module.port} is used by two modules: each module listens on its own port.`,
        });
      }
      keys.add(module.key);
      ports.add(module.port);
    });
  });
export type IoModulesFile = z.infer<typeof IoModulesFileSchema>;

export const IoStatusSchema = z.enum(["valid", "invalid", "missing"]);
export type IoStatus = z.infer<typeof IoStatusSchema>;

export const IO_PROBLEM_CODES = [
  "file_too_large",
  "invalid_encoding",
  "byte_order_mark",
  "bad_header",
  "blank_line",
  "bare_carriage_return",
  "wrong_field_count",
  "quote_in_field",
  "invalid_zone",
  "invalid_type",
  "invalid_address",
  "modules_missing",
  "modules_invalid",
  "unknown_tag",
  "duplicate_tag",
  "unknown_module",
  "zone_direction_mismatch",
  "type_mismatch",
  "type_zone_mismatch",
  "address_out_of_range",
  "address_overlap",
  "invalid_variable",
  "duplicate_variable",
] as const;
export const IoProblemCodeSchema = z.enum(IO_PROBLEM_CODES);
export type IoProblemCode = z.infer<typeof IoProblemCodeSchema>;

// `line` and `column` are 1-based and point into io.csv; they are null for a
// problem of io-modules.json (JSON has no line in a Zod issue) or of a whole file.
export const IoProblemSchema = z.object({
  file: z.enum([IO_LIST_FILE_NAME, IO_MODULES_FILE_NAME]),
  line: z.number().int().min(1).nullable(),
  column: z.number().int().min(1).nullable(),
  code: IoProblemCodeSchema,
  message: z.string(),
});
export type IoProblem = z.infer<typeof IoProblemSchema>;

// One mapped row. `type` and `direction` are the tag's own, null when the tag
// is unknown to the document (the row is then also a problem).
export const IoRowSchema = z.object({
  line: z.number().int().min(1),
  tag: z.string(),
  variable: z.string(),
  module: z.string(),
  zone: IoZoneSchema,
  address: z.number().int(),
  ioType: IoTypeSchema,
  comment: z.string(),
  type: TagTypeSchema.nullable(),
  direction: TagDirectionSchema.nullable(),
});
export type IoRow = z.infer<typeof IoRowSchema>;

export const IoMappingResponseSchema = z.object({
  status: IoStatusSchema,
  // SHA-256 (hex) of the two files' bytes, each preceded by its length; null
  // when io.csv is missing. The bridge sends it in `hello`; the core reads the
  // files again and refuses another id (close code 4003).
  mappingId: z.string().nullable(),
  // Empty when io-modules.json is missing or invalid.
  modules: z.array(IoModuleSchema),
  rows: z.array(IoRowSchema),
  problems: z.array(IoProblemSchema),
  // Tags of the document that no row maps: a warning, not a problem.
  unmappedTags: z.array(TagNameSchema),
});
export type IoMappingResponse = z.infer<typeof IoMappingResponseSchema>;
