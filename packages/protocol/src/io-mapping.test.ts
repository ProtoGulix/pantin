import { describe, expect, it } from "vitest";
import { IoMappingResponseSchema, IoModulesFileSchema } from "./io-mapping.ts";

// io-modules.json (ADR 0045 point 6).

const file = (...modules: Record<string, unknown>[]) => ({ schema_version: 1, modules });

describe("IoModulesFileSchema", () => {
  it("fills the defaults: unit id 1, low word first, 1000 ms", () => {
    expect(IoModulesFileSchema.parse(file({ key: "m1", port: 1502 })).modules).toEqual([
      { key: "m1", port: 1502, unitId: 1, wordOrder: "low_word_first", watchdogMilliseconds: 1000 },
    ]);
  });

  it("accepts the bounds of every setting", () => {
    const edge = file(
      { key: "a", port: 1024, unitId: 1, watchdogMilliseconds: 100, wordOrder: "high_word_first" },
      { key: "b", port: 65535, unitId: 247, watchdogMilliseconds: 3_600_000 },
    );
    expect(IoModulesFileSchema.safeParse(edge).success).toBe(true);
  });

  it.each([
    ["port 1023", { key: "m", port: 1023 }],
    ["port 65536", { key: "m", port: 65536 }],
    ["a fractional port", { key: "m", port: 1502.5 }],
    ["unit id 0", { key: "m", port: 1502, unitId: 0 }],
    ["unit id 248", { key: "m", port: 1502, unitId: 248 }],
    ["watchdog 99 ms", { key: "m", port: 1502, watchdogMilliseconds: 99 }],
    ["watchdog over an hour", { key: "m", port: 1502, watchdogMilliseconds: 3_600_001 }],
    ["a word order that does not exist", { key: "m", port: 1502, wordOrder: "big" }],
    ["a key with a capital", { key: "M1", port: 1502 }],
    ["an unknown setting (a typo)", { key: "m", port: 1502, unitid: 2 }],
  ])("refuses %s", (_name, module) => {
    expect(IoModulesFileSchema.safeParse(file(module)).success).toBe(false);
  });

  it("refuses a repeated port or key, naming it", () => {
    const samePort = IoModulesFileSchema.safeParse(
      file({ key: "a", port: 1502 }, { key: "b", port: 1502 }),
    );
    expect(samePort.error?.issues[0]?.message).toContain("Port 1502");
    const sameKey = IoModulesFileSchema.safeParse(
      file({ key: "a", port: 1502 }, { key: "a", port: 1503 }),
    );
    expect(sameKey.error?.issues[0]?.message).toContain('"a"');
  });

  it("refuses another schema version and unknown top level fields", () => {
    expect(IoModulesFileSchema.safeParse({ schema_version: 2, modules: [] }).success).toBe(false);
    expect(IoModulesFileSchema.safeParse({ ...file(), extra: 1 }).success).toBe(false);
  });
});

describe("IoMappingResponseSchema", () => {
  it("accepts the answer for a missing mapping", () => {
    const missing = {
      status: "missing",
      mappingId: null,
      modules: [],
      rows: [],
      problems: [],
      unmappedTags: ["a.b.c"],
    };
    expect(IoMappingResponseSchema.parse(missing)).toEqual(missing);
  });

  it("refuses a status or a problem code it does not know", () => {
    const base = { mappingId: null, modules: [], rows: [], unmappedTags: [] };
    expect(IoMappingResponseSchema.safeParse({ ...base, status: "ok", problems: [] }).success).toBe(
      false,
    );
    const problem = { file: "io.csv", line: 1, column: 1, code: "nope", message: "" };
    expect(
      IoMappingResponseSchema.safeParse({ ...base, status: "invalid", problems: [problem] })
        .success,
    ).toBe(false);
  });
});
