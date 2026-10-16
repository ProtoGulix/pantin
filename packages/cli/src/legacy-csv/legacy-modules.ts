import { IO_FILE_MAX_BYTES } from "@pantin/protocol";
import {
  IO_MODULES_FILE_NAME,
  type LegacyIoModulesFile,
  LegacyIoModulesFileSchema,
} from "./legacy-types.ts";

// The frozen reader of io-modules.json (ADR 0049 point 8): bytes in, the
// module settings or the reasons they cannot be used, one sentence each.

export type LegacyModulesReading = { modules: LegacyIoModulesFile } | { problems: string[] };

export function readLegacyModules(bytes: Uint8Array | undefined): LegacyModulesReading {
  if (bytes === undefined) {
    return {
      problems: [
        `${IO_MODULES_FILE_NAME} is missing: it holds the settings of each module (key, port), without which io.csv cannot be converted.`,
      ],
    };
  }
  if (bytes.byteLength > IO_FILE_MAX_BYTES) {
    return { problems: [`${IO_MODULES_FILE_NAME} is larger than ${IO_FILE_MAX_BYTES} bytes.`] };
  }
  let json: unknown;
  try {
    // A UTF-8 byte order mark is skipped (TextDecoder default): editors add it.
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { problems: [`${IO_MODULES_FILE_NAME} is not valid JSON (${reason}).`] };
  }
  const result = LegacyIoModulesFileSchema.safeParse(json);
  if (result.success) {
    return { modules: result.data };
  }
  return {
    problems: result.error.issues.map(
      (issue) => `${IO_MODULES_FILE_NAME}: ${issue.path.join(".") || "(file)"}: ${issue.message}`,
    ),
  };
}
