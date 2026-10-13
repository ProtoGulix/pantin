import { describe, expect, it } from "vitest";
import { IoDocumentSchema } from "./io-document.ts";

// io.json (ADR 0049 point 1).

const channel = (overrides: Record<string, unknown> = {}) => ({
  tag: "a.valve.coil_14",
  variable: "a_valve_coil_14",
  zone: "coil",
  address: 0,
  ioType: "BOOL",
  comment: "",
  ...overrides,
});
const module = (overrides: Record<string, unknown> = {}) => ({
  key: "m1",
  port: 1502,
  channels: [],
  ...overrides,
});
const file = (...modules: Record<string, unknown>[]) => ({ schema_version: 1, modules });

describe("IoDocumentSchema modules", () => {
  it("fills the defaults: unit id 1, low word first, 1000 ms", () => {
    expect(IoDocumentSchema.parse(file(module())).modules).toEqual([
      {
        key: "m1",
        port: 1502,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
        channels: [],
      },
    ]);
  });

  it("accepts the bounds of every setting", () => {
    const edge = file(
      module({
        key: "a",
        port: 1024,
        unitId: 1,
        watchdogMilliseconds: 100,
        wordOrder: "high_word_first",
      }),
      module({ key: "b", port: 65535, unitId: 247, watchdogMilliseconds: 3_600_000 }),
    );
    expect(IoDocumentSchema.safeParse(edge).success).toBe(true);
  });

  it.each([
    ["port 1023", { port: 1023 }],
    ["port 65536", { port: 65536 }],
    ["a fractional port", { port: 1502.5 }],
    ["unit id 0", { unitId: 0 }],
    ["unit id 248", { unitId: 248 }],
    ["watchdog 99 ms", { watchdogMilliseconds: 99 }],
    ["watchdog over an hour", { watchdogMilliseconds: 3_600_001 }],
    ["a word order that does not exist", { wordOrder: "big" }],
    ["a key with a capital", { key: "M1" }],
    ["an unknown setting (a typo)", { unitid: 2 }],
    ["no channels array", { channels: undefined }],
  ])("refuses %s", (_name, overrides) => {
    expect(IoDocumentSchema.safeParse(file(module(overrides))).success).toBe(false);
  });

  it("refuses a repeated port or key, naming it", () => {
    const samePort = IoDocumentSchema.safeParse(file(module(), module({ key: "b" })));
    expect(samePort.error?.issues[0]?.message).toContain("Port 1502");
    expect(samePort.error?.issues[0]?.path).toEqual(["modules", 1, "port"]);
    const sameKey = IoDocumentSchema.safeParse(file(module(), module({ port: 1503 })));
    expect(sameKey.error?.issues[0]?.message).toContain('"m1"');
  });
});

describe("IoDocumentSchema channels", () => {
  it("accepts the channels of the ADR example", () => {
    expect(IoDocumentSchema.safeParse(file(module({ channels: [channel()] }))).success).toBe(true);
  });

  it.each([
    ["an address below 0", { address: -1 }],
    ["an address above 65535", { address: 65536 }],
    ["a fractional address", { address: 1.5 }],
    ["a zone that does not exist", { zone: "holding" }],
    ["an io type that does not exist", { ioType: "INT" }],
    ["the old `type` field in place of ioType", { ioType: undefined, type: "BOOL" }],
    ["a tag that is not a tag name", { tag: "Not A Tag" }],
    ["a missing comment", { comment: undefined }],
    ["an unknown field", { module: "m1" }],
  ])("refuses %s", (_name, overrides) => {
    const document = file(module({ channels: [channel(overrides)] }));
    expect(IoDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("accepts a tag in one channel only: a second one is refused at its path", () => {
    const twice = file(
      module({ channels: [channel()] }),
      module({ key: "m2", port: 1503, channels: [channel({ address: 1 })] }),
    );
    const result = IoDocumentSchema.safeParse(twice);
    expect(result.error?.issues[0]?.path).toEqual(["modules", 1, "channels", 0, "tag"]);
  });
});

describe("IoDocumentSchema file", () => {
  it("refuses another schema version and unknown top level fields", () => {
    expect(IoDocumentSchema.safeParse({ schema_version: 2, modules: [] }).success).toBe(false);
    expect(IoDocumentSchema.safeParse({ ...file(), extra: 1 }).success).toBe(false);
    expect(IoDocumentSchema.safeParse({ modules: [] }).success).toBe(false);
  });
});
