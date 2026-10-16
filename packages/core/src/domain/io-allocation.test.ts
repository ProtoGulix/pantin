import type { IoChannel } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  allocateVariable,
  nextModuleKey,
  proposeAddress,
  smallestFreePort,
  zoneAndTypeOf,
} from "./io-allocation.ts";

// The allocation rules of ADR 0049 point 4, as a table each.

describe("nextModuleKey", () => {
  it.each([
    [[], "m1"],
    [["m1"], "m2"],
    [["m1", "m3"], "m2"],
    [["m2"], "m1"],
    [["left", "m1"], "m2"],
    [["m10", "m1", "m2"], "m3"],
  ])("%j gives %s", (used, expected) => {
    expect(nextModuleKey(used)).toBe(expected);
  });
});

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
    expect(zoneAndTypeOf(type, direction)).toEqual({ zone, ioType });
  });
});

const channel = (
  zone: IoChannel["zone"],
  address: number,
  ioType: IoChannel["ioType"],
): Pick<IoChannel, "zone" | "address" | "ioType"> => ({ zone, address, ioType });

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

describe("allocateVariable", () => {
  it.each([
    ["no variable taken", "pince.valve.coil_a", [], "pince_valve_coil_a"],
    ["another variable taken", "pince.valve.coil_a", ["other"], "pince_valve_coil_a"],
    ["the derived one taken", "pince.valve.coil_a", ["pince_valve_coil_a"], "pince_valve_coil_a_2"],
    ["taken ignoring case", "pince.valve.coil_a", ["PINCE_Valve_Coil_A"], "pince_valve_coil_a_2"],
    ["the first suffix taken too", "a.b", ["a_b", "a_b_2"], "a_b_3"],
    ["a suffix taken ignoring case", "a.b", ["a_b", "A_B_2"], "a_b_3"],
  ])("%s", (_name, tag, taken, expected) => {
    expect(allocateVariable(tag, taken)).toBe(expected);
  });

  it("keeps a suffixed variable within 64 characters", () => {
    const tag = `${"a".repeat(30)}.${"b".repeat(33)}`;
    const base = allocateVariable(tag, []);
    expect(base).toHaveLength(64);
    const second = allocateVariable(tag, [base]);
    expect(second).toHaveLength(64);
    expect(second.endsWith("_2")).toBe(true);
    expect(second.toLowerCase()).not.toBe(base.toLowerCase());
  });

  it("never leaves a double underscore where the cut falls", () => {
    // 61 letters, "_", "b": the cut at 62 characters would end in "_".
    const tag = `${"a".repeat(61)}.b`;
    const second = allocateVariable(tag, [allocateVariable(tag, [])]);
    expect(second).toBe(`${"a".repeat(61)}_2`);
  });
});
