import { describe, expect, it } from "vitest";
import { proposeAddress, smallestFreePort, zoneAndTypeOf } from "./rules-allocation.ts";
import type { ModbusChannel } from "./schema.ts";

// The allocation rules of ADR 0049 point 4, as a table each.

describe("smallestFreePort", () => {
  it.each([
    [[], 1502],
    [[1502], 1503],
    [[1503], 1502],
    [[1502, 1504], 1503],
    [[1024, 1501], 1502],
  ])("%j gives %s", (used, expected) => {
    expect(smallestFreePort(used)).toBe(expected);
  });

  it("is null when every port from 1502 is taken", () => {
    const all = Array.from({ length: 65535 - 1502 + 1 }, (_, index) => 1502 + index);
    expect(smallestFreePort(all)).toBeNull();
  });
});

describe("zoneAndTypeOf", () => {
  it.each([
    ["bit", "command", "coil", "BOOL"],
    ["bit", "feedback", "discrete_input", "BOOL"],
    ["float", "command", "holding_register", "REAL"],
    ["float", "feedback", "input_register", "REAL"],
    ["integer", "command", "holding_register", "DINT"],
    ["integer", "feedback", "input_register", "DINT"],
  ] as const)("a %s %s is a %s of type %s", (type, direction, zone, ioType) => {
    expect(zoneAndTypeOf({ type, direction })).toEqual({ zone, ioType });
  });
});

const channel = (
  zone: ModbusChannel["zone"],
  address: number,
  ioType: ModbusChannel["ioType"],
): ModbusChannel => ({ zone, address, ioType });

describe("proposeAddress", () => {
  it.each([
    ["an empty module, a bit", [], "coil", "BOOL", 0],
    ["an empty module, a register value", [], "holding_register", "REAL", 0],
    ["bits step by 1", [channel("coil", 0, "BOOL")], "coil", "BOOL", 1],
    [
      "the lowest hole of a bit zone",
      [channel("coil", 0, "BOOL"), channel("coil", 2, "BOOL")],
      "coil",
      "BOOL",
      1,
    ],
    [
      "registers step by 2",
      [channel("holding_register", 0, "REAL")],
      "holding_register",
      "DINT",
      2,
    ],
    [
      "a hole of two registers",
      [channel("holding_register", 0, "REAL"), channel("holding_register", 4, "REAL")],
      "holding_register",
      "REAL",
      2,
    ],
    ["another zone is ignored", [channel("coil", 0, "BOOL")], "discrete_input", "BOOL", 0],
    [
      "an odd register address stays blocked",
      [channel("holding_register", 1, "REAL")],
      "holding_register",
      "REAL",
      4,
    ],
  ] as const)("%s", (_name, channels, zone, ioType, expected) => {
    expect(proposeAddress(channels, zone, ioType)).toBe(expected);
  });
});

describe("proposeAddress limits", () => {
  it("is null when the zone is full", () => {
    const full = Array.from({ length: 65536 }, (_, address) => channel("coil", address, "BOOL"));
    expect(proposeAddress(full, "coil", "BOOL")).toBeNull();
  });

  it("is null when a two-register value would run past 65535", () => {
    const channels = [channel("holding_register", 0, "REAL")];
    for (let address = 2; address <= 65534; address += 2) {
      channels.push(channel("holding_register", address, "REAL"));
    }
    expect(proposeAddress(channels, "holding_register", "REAL")).toBeNull();
  });
});
