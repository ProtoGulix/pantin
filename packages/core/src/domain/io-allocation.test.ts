import { describe, expect, it } from "vitest";
import { allocateVariable, nextModuleKey } from "./io-allocation.ts";

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
