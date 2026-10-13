import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TAG_BUS_CLOSE_CODES,
  TAG_BUS_VERSION,
  TagBusClientMessageSchema,
  TagBusServerMessageSchema,
} from "./tag-bus.ts";

// The fixtures are shared with the Python bridge (ADR 0045 point 2): its
// pytest decodes the same file.
const FixtureFileSchema = z.object({
  version: z.literal(TAG_BUS_VERSION),
  client: z.object({ valid: z.array(z.unknown()), invalid: z.array(z.unknown()) }),
  server: z.object({ valid: z.array(z.unknown()), invalid: z.array(z.unknown()) }),
});

const ValidCaseSchema = z.object({ name: z.string(), message: z.unknown() });
const InvalidCaseSchema = z.object({
  name: z.string(),
  message: z.unknown().optional(),
  text: z.string().optional(),
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/tag-bus-messages.json", import.meta.url), "utf8"),
  ) as unknown,
);

// A frame as the core would read it: the decoded message, or the raw text when
// the fixture says the frame is not JSON.
function decodedFrame(entry: z.infer<typeof InvalidCaseSchema>): unknown {
  if (entry.text === undefined) {
    return entry.message;
  }
  try {
    return JSON.parse(entry.text) as unknown;
  } catch {
    return undefined;
  }
}

const SIDES = [
  ["client", TagBusClientMessageSchema, fixtures.client],
  ["server", TagBusServerMessageSchema, fixtures.server],
] as const;

describe.each(SIDES)("tag bus %s messages", (_side, schema, cases) => {
  const valid = cases.valid.map((entry) => ValidCaseSchema.parse(entry));
  const invalid = cases.invalid.map((entry) => InvalidCaseSchema.parse(entry));

  it.each(valid.map((entry) => [entry.name, entry.message] as const))(
    "accepts: %s",
    (_name, message) => {
      expect(schema.safeParse(message).success).toBe(true);
    },
  );

  it.each(invalid.map((entry) => [entry.name, entry] as const))("refuses: %s", (_name, entry) => {
    expect(schema.safeParse(decodedFrame(entry)).success).toBe(false);
  });

  it("covers every message type with a valid case", () => {
    const options = schema.options.map((option) => option.shape.type.value);
    const covered = valid.map((entry) => z.object({ type: z.string() }).parse(entry.message).type);
    expect(new Set(covered)).toEqual(new Set(options));
  });
});

describe("tag bus close codes", () => {
  it("are the application codes 4000 to 4005 of ADR 0045", () => {
    expect(Object.values(TAG_BUS_CLOSE_CODES)).toEqual([4000, 4001, 4002, 4003, 4004, 4005]);
  });
});
