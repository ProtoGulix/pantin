import { describe, expect, it } from "vitest";
import { IoDocumentSchema } from "./io-document.ts";

// io.json version 2 (ADR 0049 point 1, ADR 0064 point 4).

const channel = (overrides: Record<string, unknown> = {}) => ({
  tag: "a.valve.coil_14",
  variable: "a_valve_coil_14",
  comment: "",
  modbus: { zone: "coil", address: 0, ioType: "BOOL" },
  ...overrides,
});
const modbusOf = (overrides: Record<string, unknown>) => ({
  zone: "coil",
  address: 0,
  ioType: "BOOL",
  ...overrides,
});
const module = (
  transport: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) => ({
  key: "m1",
  transport: { kind: "modbus_tcp_slave", port: 1502, ...transport },
  channels: [],
  ...overrides,
});
const file = (...modules: Record<string, unknown>[]) => ({ schema_version: 2, modules });

describe("IoDocumentSchema transports", () => {
  it("fills the defaults: unit id 1, low word first, 1000 ms", () => {
    expect(IoDocumentSchema.parse(file(module())).modules).toEqual([
      {
        key: "m1",
        transport: {
          kind: "modbus_tcp_slave",
          port: 1502,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 1000,
        },
        channels: [],
      },
    ]);
  });

  it("accepts the bounds of every setting", () => {
    const edge = file(
      module({ port: 1024, unitId: 1, watchdogMilliseconds: 100, wordOrder: "high_word_first" }),
      module({ port: 65535, unitId: 247, watchdogMilliseconds: 3_600_000 }, { key: "b" }),
    );
    expect(IoDocumentSchema.safeParse(edge).success).toBe(true);
  });
});

describe("IoDocumentSchema refused transports", () => {
  it.each([
    ["port 1023", module({ port: 1023 })],
    ["port 65536", module({ port: 65536 })],
    ["a fractional port", module({ port: 1502.5 })],
    ["unit id 0", module({ unitId: 0 })],
    ["unit id 248", module({ unitId: 248 })],
    ["watchdog 99 ms", module({ watchdogMilliseconds: 99 })],
    ["watchdog over an hour", module({ watchdogMilliseconds: 3_600_001 })],
    ["a word order that does not exist", module({ wordOrder: "big" })],
    ["a transport kind that does not exist", module({ kind: "carrier_pigeon" })],
    ["no transport kind", module({ kind: undefined })],
    ["a key with a capital", module({}, { key: "M1" })],
    ["an unknown setting (a typo)", module({ unitid: 2 })],
    ["the version 1 port at module level", module({}, { port: 1502 })],
    ["no transport", module({}, { transport: undefined })],
    ["no channels array", module({}, { channels: undefined })],
  ])("refuses %s", (_name, badModule) => {
    expect(IoDocumentSchema.safeParse(file(badModule)).success).toBe(false);
  });

  it("refuses a repeated module key, naming it", () => {
    const sameKey = IoDocumentSchema.safeParse(file(module(), module({ port: 1503 })));
    expect(sameKey.error?.issues[0]?.message).toContain('"m1"');
    expect(sameKey.error?.issues[0]?.path).toEqual(["modules", 1, "key"]);
  });

  it("leaves a repeated port to the core's validation", () => {
    const samePort = IoDocumentSchema.safeParse(file(module(), module({}, { key: "b" })));
    expect(samePort.success).toBe(true);
  });
});

describe("IoDocumentSchema channels", () => {
  const withChannels = (...channels: Record<string, unknown>[]) => file(module({}, { channels }));

  it("accepts the channels of the ADR example", () => {
    expect(IoDocumentSchema.safeParse(withChannels(channel())).success).toBe(true);
  });

  it.each([
    ["an address below 0", { modbus: modbusOf({ address: -1 }) }],
    ["an address above 65535", { modbus: modbusOf({ address: 65536 }) }],
    ["a fractional address", { modbus: modbusOf({ address: 1.5 }) }],
    ["a zone that does not exist", { modbus: modbusOf({ zone: "holding" }) }],
    ["an io type that does not exist", { modbus: modbusOf({ ioType: "INT" }) }],
    ["an unknown field in the sub-object", { modbus: modbusOf({ unit: 1 }) }],
    ["a tag that is not a tag name", { tag: "Not A Tag" }],
    ["a missing comment", { comment: undefined }],
    ["an unknown field", { module: "m1" }],
    ["the version 1 zone at channel level", { zone: "coil" }],
  ])("refuses %s", (_name, overrides) => {
    expect(IoDocumentSchema.safeParse(withChannels(channel(overrides))).success).toBe(false);
  });

  it("refuses a channel without the sub-object of its transport, at its path", () => {
    const result = IoDocumentSchema.safeParse(withChannels(channel({ modbus: undefined })));
    expect(result.error?.issues[0]?.path).toEqual(["modules", 0, "channels", 0, "modbus"]);
    expect(result.error?.issues[0]?.message).toContain("modbus_tcp_slave");
  });

  it("refuses a tag twice in one module, at the second channel", () => {
    const twice = withChannels(channel(), channel({ modbus: modbusOf({ address: 1 }) }));
    const result = IoDocumentSchema.safeParse(twice);
    expect(result.error?.issues[0]?.path).toEqual(["modules", 0, "channels", 1, "tag"]);
  });

  it("accepts the same tag in two modules: the core refuses a command twice", () => {
    const twoModules = file(
      module({}, { channels: [channel()] }),
      module({ port: 1503 }, { key: "m2", channels: [channel()] }),
    );
    expect(IoDocumentSchema.safeParse(twoModules).success).toBe(true);
  });
});

describe("IoDocumentSchema file", () => {
  it("refuses another schema version and unknown top level fields", () => {
    expect(IoDocumentSchema.safeParse({ schema_version: 1, modules: [] }).success).toBe(false);
    expect(IoDocumentSchema.safeParse({ schema_version: 3, modules: [] }).success).toBe(false);
    expect(IoDocumentSchema.safeParse({ ...file(), extra: 1 }).success).toBe(false);
    expect(IoDocumentSchema.safeParse({ modules: [] }).success).toBe(false);
  });
});
