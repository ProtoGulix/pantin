import {
  IoModuleSettingsSchema,
  type IoStatus,
  IoTypeSchema,
  IoZoneSchema,
  TagDirectionSchema,
  TagTypeSchema,
} from "@pantin/protocol";
import { z } from "zod";

// The types of io.csv and io-modules.json, the "version 0" of the I/O mapping
// (ADR 0049 point 8). Temporary and frozen: the CLI still reads these files
// until slice P3 moves the parser into `pantin io migrate`, and this folder is
// removed with it. The core serves io.json only; nothing outside the CLI and
// this folder may import from here.

export const IO_LIST_FILE_NAME = "io.csv";
export const IO_MODULES_FILE_NAME = "io-modules.json";
const LEGACY_IO_FILE_NAMES = [IO_LIST_FILE_NAME, IO_MODULES_FILE_NAME] as const;
export type LegacyIoFileName = (typeof LEGACY_IO_FILE_NAMES)[number];
// The first line of io.csv, exactly: it is also the version of the format.
export const IO_LIST_HEADER = "tag;variable;module;zone;address;type;comment";

const LEGACY_IO_PROBLEM_CODES = [
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
export type LegacyIoProblemCode = (typeof LEGACY_IO_PROBLEM_CODES)[number];

// `line` and `column` are 1-based and point into io.csv; they are null for a
// problem of io-modules.json or of a whole file.
export type LegacyIoProblem = {
  file: LegacyIoFileName;
  line: number | null;
  column: number | null;
  code: LegacyIoProblemCode;
  message: string;
};

const LegacyIoRowSchema = z.object({
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
export type LegacyIoRow = z.infer<typeof LegacyIoRowSchema>;

export const LegacyIoModulesFileSchema = z
  .strictObject({
    schema_version: z.literal(1),
    modules: z.array(IoModuleSettingsSchema),
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
export type LegacyIoModulesFile = z.infer<typeof LegacyIoModulesFileSchema>;

export type LegacyIoMappingResponse = {
  status: IoStatus;
  // SHA-256 of the two files' bytes; null when io.csv is missing.
  mappingId: string | null;
  modules: LegacyIoModulesFile["modules"];
  rows: LegacyIoRow[];
  problems: LegacyIoProblem[];
  unmappedTags: string[];
};
