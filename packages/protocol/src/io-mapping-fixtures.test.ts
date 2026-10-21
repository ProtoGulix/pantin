import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IoMappingResponseSchema } from "./io-mapping.ts";

// The fixtures are shared with the Python bridge (ADR 0045 point 2): its pytest
// decodes the same file with a hand-written decoder.
const CaseSchema = z.object({ name: z.string(), message: z.unknown() });
const FixtureFileSchema = z.object({
  version: z.literal(2),
  valid: z.array(CaseSchema),
  invalid: z.array(CaseSchema),
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/io-mapping-responses.json", import.meta.url), "utf8"),
  ) as unknown,
);

describe("io mapping response fixtures", () => {
  it.each(fixtures.valid.map((entry) => [entry.name, entry.message] as const))(
    "accepts: %s",
    (_name, message) => {
      expect(IoMappingResponseSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each(fixtures.invalid.map((entry) => [entry.name, entry.message] as const))(
    "refuses: %s",
    (_name, message) => {
      expect(IoMappingResponseSchema.safeParse(message).success).toBe(false);
    },
  );
});
