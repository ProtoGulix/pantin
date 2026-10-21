import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ApplyIoVariablesRequestSchema,
  IO_VARIABLES_MAX_ENTRIES,
  SymbolImportPreviewSchema,
} from "./symbol-import.ts";

const CaseSchema = z.object({ name: z.string(), message: z.unknown() });
const CasesSchema = z.object({ valid: z.array(CaseSchema), invalid: z.array(CaseSchema) });
const FixtureFileSchema = z.object({
  version: z.literal(1),
  previews: CasesSchema,
  applyRequests: CasesSchema,
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/symbol-import-messages.json", import.meta.url), "utf8"),
  ) as unknown,
);

function entries(cases: z.infer<typeof CaseSchema>[]) {
  return cases.map((entry) => [entry.name, entry.message] as const);
}

describe.each([
  ["preview", SymbolImportPreviewSchema, fixtures.previews],
  ["apply request", ApplyIoVariablesRequestSchema, fixtures.applyRequests],
] as const)("symbol import %s fixtures", (_label, schema, cases) => {
  it.each(entries(cases.valid))("accepts: %s", (_name, message) => {
    expect(schema.safeParse(message).success).toBe(true);
  });

  it.each(entries(cases.invalid))("refuses: %s", (_name, message) => {
    expect(schema.safeParse(message).success).toBe(false);
  });
});

describe("the apply request limit", () => {
  const assignment = { module: "m1", tag: "axis.valve.coil_14", variable: "x" };

  it("accepts the maximum number of entries and refuses one more", () => {
    const of = (count: number) => ({ assignments: Array(count).fill(assignment) });
    expect(ApplyIoVariablesRequestSchema.safeParse(of(IO_VARIABLES_MAX_ENTRIES)).success).toBe(
      true,
    );
    expect(ApplyIoVariablesRequestSchema.safeParse(of(IO_VARIABLES_MAX_ENTRIES + 1)).success).toBe(
      false,
    );
  });
});
