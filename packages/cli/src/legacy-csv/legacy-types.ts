import { IoModuleSettingsSchema } from "@pantin/protocol";
import { z } from "zod";

// The vocabulary of io.csv and io-modules.json, the "version 0" of the I/O
// mapping (ADR 0049 point 8). Frozen: only `pantin io migrate` reads these
// files, and this folder is deleted with it (docs/backlog/remove-io-migrate.md).

export const IO_LIST_FILE_NAME = "io.csv";
export const IO_MODULES_FILE_NAME = "io-modules.json";
// The first line of io.csv, exactly: it is also the version of the format.
export const IO_LIST_HEADER = "tag;variable;module;zone;address;type;comment";

export type LegacyIoProblemCode =
  | "invalid_encoding"
  | "byte_order_mark"
  | "bad_header"
  | "blank_line"
  | "bare_carriage_return"
  | "wrong_field_count"
  | "quote_in_field"
  | "invalid_zone"
  | "invalid_type"
  | "invalid_address";

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
