import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SIGNAL_OWNER_KINDS, SIGNAL_UNITS, SignalListResponseSchema } from "./signal.ts";

const CaseSchema = z.object({ name: z.string(), message: z.unknown() });
const FixtureFileSchema = z.object({
  version: z.literal(1),
  valid: z.array(CaseSchema),
  invalid: z.array(CaseSchema),
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/signal-responses.json", import.meta.url), "utf8"),
  ) as unknown,
);

describe("signal response fixtures", () => {
  it.each(fixtures.valid.map((entry) => [entry.name, entry.message] as const))(
    "accepts: %s",
    (_name, message) => {
      expect(SignalListResponseSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each(fixtures.invalid.map((entry) => [entry.name, entry.message] as const))(
    "refuses: %s",
    (_name, message) => {
      expect(SignalListResponseSchema.safeParse(message).success).toBe(false);
    },
  );

  it("holds every owner kind and every unit", () => {
    const signals = fixtures.valid.flatMap(
      (entry) => SignalListResponseSchema.parse(entry.message).signals,
    );
    expect(new Set(signals.map((signal) => signal.owner.kind))).toEqual(
      new Set(SIGNAL_OWNER_KINDS),
    );
    expect(new Set(signals.map((signal) => signal.unit))).toEqual(new Set(SIGNAL_UNITS));
  });
});
