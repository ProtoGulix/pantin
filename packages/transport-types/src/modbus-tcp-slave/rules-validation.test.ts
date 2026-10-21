import { describe, expect, it } from "vitest";
import type { RuleModule } from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import type { TransportChannel } from "../schemas.ts";
import { validateModbusModule } from "./rules-validation.ts";
import type { ModbusChannel } from "./schema.ts";

// The Modbus rules of ADR 0049 point 6, with paths relative to the module.

const SIGNALS = new Map<string, SignalShape>([
  ["a.valve.coil_14", { type: "bit", direction: "command" }],
  ["a.sw.state", { type: "bit", direction: "feedback" }],
  ["a.axis.setpoint", { type: "float", direction: "command" }],
  ["a.axis.position", { type: "float", direction: "feedback" }],
  ["a.enc.count", { type: "integer", direction: "feedback" }],
]);

function channel(tag: string, modbus: Partial<ModbusChannel> = {}): TransportChannel {
  return {
    tag,
    variable: tag.replaceAll(".", "_"),
    comment: "",
    modbus: { zone: "coil", address: 0, ioType: "BOOL", ...modbus },
  };
}

function moduleOf(...channels: TransportChannel[]): RuleModule {
  return {
    key: "m1",
    transport: {
      kind: "modbus_tcp_slave",
      port: 1502,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
    },
    channels,
  };
}

const problemsOf = (...channels: TransportChannel[]) =>
  validateModbusModule(moduleOf(...channels), SIGNALS);
const codesOf = (...channels: TransportChannel[]) => problemsOf(...channels).map((p) => p.code);

const position = (address: number) =>
  channel("a.axis.position", { zone: "input_register", ioType: "REAL", address });
const count = (address: number) =>
  channel("a.enc.count", { zone: "input_register", ioType: "DINT", address });

describe("validateModbusModule consistent tags", () => {
  it("accepts one consistent channel per tag", () => {
    const channels = [
      channel("a.valve.coil_14"),
      channel("a.sw.state", { zone: "discrete_input" }),
      channel("a.axis.setpoint", { zone: "holding_register", ioType: "REAL" }),
      position(0),
      count(2),
    ];
    expect(problemsOf(...channels)).toEqual([]);
  });

  it("reports a zone the direction does not allow, at the zone path", () => {
    expect(problemsOf(channel("a.sw.state", { zone: "coil" }))).toMatchObject([
      { path: ["channels", 0, "modbus", "zone"], code: "zone_direction_mismatch" },
    ]);
  });

  it("reports an io type the tag type does not give, at the ioType path", () => {
    const wrong = channel("a.axis.setpoint", { zone: "holding_register", ioType: "DINT" });
    expect(problemsOf(wrong)).toMatchObject([
      { path: ["channels", 0, "modbus", "ioType"], code: "type_mismatch" },
    ]);
  });

  it("reports a BOOL in a register zone and a REAL in a bit zone as type_zone_mismatch", () => {
    const wrong = [
      channel("a.valve.coil_14", { zone: "holding_register" }),
      channel("a.axis.setpoint", { zone: "coil", ioType: "REAL", address: 4 }),
    ];
    expect(problemsOf(...wrong).filter((p) => p.code === "type_zone_mismatch")).toHaveLength(2);
  });

  it("leaves an unknown tag to the core: only the signal-free rules apply to it", () => {
    expect(problemsOf(channel("a.ghost.coil"))).toEqual([]);
  });
});

describe("validateModbusModule addresses", () => {
  it("reports a REAL whose second register runs past 65535, and only that", () => {
    expect(codesOf(position(65534))).toEqual([]);
    expect(problemsOf(position(65535))).toMatchObject([
      { path: ["channels", 0, "modbus", "address"], code: "address_out_of_range" },
    ]);
  });

  it("reports an overlap on the later channel, per zone", () => {
    expect(problemsOf(position(0), count(1))).toMatchObject([
      { path: ["channels", 1, "modbus", "address"], code: "address_overlap" },
    ]);
    expect(codesOf(position(0), count(2))).toEqual([]);
  });

  it("does not count a channel past the end as overlapping", () => {
    expect(codesOf(position(65535), count(65534))).not.toContain("address_overlap");
  });
});
