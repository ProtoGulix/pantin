import { describe, expect, it } from "vitest";
import type { RuleModule } from "../rule-types.ts";
import type { TransportChannel } from "../schemas.ts";
import { MODBUS_TCP_SLAVE_PRESENTATION } from "./presentation.ts";
import { MODBUS_TCP_SLAVE_RULES } from "./rules.ts";
import { MODBUS_TCP_SLAVE_KIND, type ModbusChannel } from "./schema.ts";

// The module and channel edits of the Modbus TCP slave transport (ADR 0064 points 3 and 6).

const rules = MODBUS_TCP_SLAVE_RULES;
const TRANSPORT = {
  kind: MODBUS_TCP_SLAVE_KIND,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first",
  watchdogMilliseconds: 1000,
} as const;

const channel = (tag: string, modbus: ModbusChannel): TransportChannel => ({
  tag,
  variable: tag.replaceAll(".", "_"),
  comment: "",
  modbus,
});
const moduleOf = (...channels: TransportChannel[]): RuleModule => ({
  key: "m1",
  transport: TRANSPORT,
  channels,
});

describe("createTransport and patchTransport", () => {
  it("proposes the smallest free port and the defaults", () => {
    expect(rules.createTransport({ kind: MODBUS_TCP_SLAVE_KIND }, [1502, 1504])).toEqual({
      ...TRANSPORT,
      port: 1503,
    });
  });

  it("keeps what the request names", () => {
    const created = rules.createTransport(
      { kind: MODBUS_TCP_SLAVE_KIND, port: 1600, unitId: 7, wordOrder: "high_word_first" },
      [1502],
    );
    expect(created).toEqual({
      kind: MODBUS_TCP_SLAVE_KIND,
      port: 1600,
      unitId: 7,
      wordOrder: "high_word_first",
      watchdogMilliseconds: 1000,
    });
  });

  it("says why when every port is taken", () => {
    const all = Array.from({ length: 65535 - 1502 + 1 }, (_, index) => 1502 + index);
    expect(rules.createTransport({ kind: MODBUS_TCP_SLAVE_KIND }, all)).toContain("Every port");
  });

  it("changes only the settings that are sent", () => {
    expect(rules.patchTransport(TRANSPORT, { kind: MODBUS_TCP_SLAVE_KIND, unitId: 9 })).toEqual({
      ...TRANSPORT,
      unitId: 9,
    });
  });

  it("listens on its port", () => {
    expect(rules.listenPort(TRANSPORT)).toBe(1502);
  });
});

describe("proposeChannel and reshapeChannel", () => {
  const coil = { type: "bit", direction: "command" } as const;
  const position = { type: "float", direction: "feedback" } as const;

  it("gives the zone and type of the signal and the lowest free address", () => {
    const module = moduleOf(channel("a.b.c", { zone: "coil", address: 0, ioType: "BOOL" }));
    expect(rules.proposeChannel(module, coil)).toEqual({
      fields: { modbus: { zone: "coil", address: 1, ioType: "BOOL" } },
    });
  });

  it("says why a zone is full", () => {
    const full = Array.from({ length: 65536 }, (_, address) =>
      channel(`a.b.c${address}`, { zone: "coil", address, ioType: "BOOL" }),
    );
    expect(rules.proposeChannel(moduleOf(...full), coil)).toEqual({
      refusal: expect.stringContaining("no free address left in zone coil"),
    });
  });

  it("keeps the address of a channel whose zone and width did not change", () => {
    const current = channel("a.b.c", { zone: "coil", address: 5, ioType: "BOOL" });
    const kept = rules.reshapeChannel(moduleOf(), current, coil, false);
    expect(kept).toEqual({ fields: { modbus: { zone: "coil", address: 5, ioType: "BOOL" } } });
  });

  it("proposes an address again when the zone changes or the channel moves", () => {
    const current = channel("a.b.c", { zone: "coil", address: 5, ioType: "BOOL" });
    expect(rules.reshapeChannel(moduleOf(), current, position, false)).toEqual({
      fields: { modbus: { zone: "input_register", address: 0, ioType: "REAL" } },
    });
    expect(rules.reshapeChannel(moduleOf(), current, coil, true)).toEqual({
      fields: { modbus: { zone: "coil", address: 0, ioType: "BOOL" } },
    });
  });

  it("derives the fields of a channel that has none, coming from another transport", () => {
    const foreign: TransportChannel = { tag: "a.b.c", variable: "v", comment: "" };
    expect(rules.reshapeChannel(moduleOf(), foreign, coil, true)).toEqual({
      fields: { modbus: { zone: "coil", address: 0, ioType: "BOOL" } },
    });
  });
});

describe("patchChannel, order and text", () => {
  const sample = channel("a.b.c", { zone: "holding_register", address: 4, ioType: "REAL" });

  it("changes the address only", () => {
    expect(rules.patchChannel(sample, { modbus: { address: 8 } })).toEqual({
      modbus: { zone: "holding_register", address: 8, ioType: "REAL" },
    });
    expect(rules.patchChannel(sample, {})).toEqual({ modbus: sample.modbus });
  });

  it("sorts by zone, then address, then tag", () => {
    const first = channel("z.z.z", { zone: "coil", address: 9, ioType: "BOOL" });
    const second = channel("a.a.a", { zone: "input_register", address: 0, ioType: "REAL" });
    const third = channel("b.b.b", { zone: "input_register", address: 0, ioType: "REAL" });
    expect([third, second, first].toSorted(rules.compareChannels).map((c) => c.tag)).toEqual([
      "z.z.z",
      "a.a.a",
      "b.b.b",
    ]);
  });

  it("writes the keys of a channel and of the settings in a fixed order", () => {
    expect(Object.keys(rules.orderedChannelFields(sample).modbus ?? {})).toEqual([
      "zone",
      "address",
      "ioType",
    ]);
    expect(Object.keys(rules.orderedTransport(TRANSPORT))).toEqual([
      "kind",
      "port",
      "unitId",
      "wordOrder",
      "watchdogMilliseconds",
    ]);
  });

  it("carries every signal", () => {
    expect(rules.supportsSignal({ type: "integer", direction: "command" })).toBe(true);
  });

  it("shows the endpoint, the address and the type as text", () => {
    const presentation = MODBUS_TCP_SLAVE_PRESENTATION;
    expect(presentation.transportText(TRANSPORT)).toBe("Modbus TCP slave");
    expect(presentation.endpointText(TRANSPORT)).toBe("port 1502, unit 1");
    expect(presentation.addressText(sample)).toBe("holding_register 4");
    expect(presentation.plcTypeText(sample)).toBe("REAL");
  });
});
