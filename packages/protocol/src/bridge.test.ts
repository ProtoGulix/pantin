import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BRIDGE_EXIT_KINDS, BridgeStatusLineSchema, SetBridgeRequestSchema } from "./bridge.ts";

// The fixture is shared with the Python bridge (ADR 0050 point 2): an entry
// holds either the decoded line (`message`) or a line that is not JSON (`text`).
const CaseSchema = z.object({
  name: z.string(),
  message: z.unknown().optional(),
  text: z.string().optional(),
});
const FixtureFileSchema = z.object({
  version: z.literal(1),
  maxLineBytes: z.number().int(),
  exitKinds: z.array(z.string()),
  valid: z.array(CaseSchema),
  invalid: z.array(CaseSchema),
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/bridge-status-lines.json", import.meta.url), "utf8"),
  ) as unknown,
);

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

describe("bridge status line fixtures", () => {
  it("lists the same exit kinds as the schema", () => {
    expect(fixtures.exitKinds).toEqual([...BRIDGE_EXIT_KINDS]);
  });

  it.each(fixtures.valid.map((entry) => [entry.name, entry.message] as const))(
    "accepts: %s",
    (_name, message) => {
      expect(BridgeStatusLineSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each(fixtures.invalid.map((entry) => [entry.name, entry] as const))(
    "refuses: %s",
    (_name, entry) => {
      if (entry.text !== undefined) {
        expect(isJson(entry.text)).toBe(false);
      } else {
        expect(BridgeStatusLineSchema.safeParse(entry.message).success).toBe(false);
      }
    },
  );
});

describe("SetBridgeRequestSchema", () => {
  it("reads a start request, with an empty allow list by default", () => {
    expect(SetBridgeRequestSchema.parse({ running: true, listen: "127.0.0.1" })).toEqual({
      running: true,
      listen: "127.0.0.1",
      allow: [],
    });
  });

  it("reads a stop request", () => {
    expect(SetBridgeRequestSchema.parse({ running: false })).toEqual({ running: false });
  });

  it.each([
    ["an unknown field on start", { running: true, listen: "127.0.0.1", python: "x" }],
    ["a listen field on stop", { running: false, listen: "127.0.0.1" }],
    ["a start without listen", { running: true }],
    [
      "more than 16 allow entries",
      { running: true, listen: "10.0.0.1", allow: Array(17).fill("1.1.1.1") },
    ],
    ["no running field", { listen: "127.0.0.1" }],
  ])("refuses %s", (_name, body) => {
    expect(SetBridgeRequestSchema.safeParse(body).success).toBe(false);
  });
});
