import { describe, expect, it } from "vitest";
import { int64ToWords, wordsToInt64, wrapToIecType } from "./signal-values.ts";

describe("wrapToIecType", () => {
  it.each([
    ["INT", 32767, 32767],
    ["INT", 32768, -32768],
    ["INT", -32769, 32767],
    ["DINT", 2 ** 31, -(2 ** 31)],
    ["DINT", 2.9, 2],
    ["DINT", -2.9, -2],
    ["LINT", 2 ** 63, -(2 ** 63)],
  ] as const)("%s %d becomes %d", (iecType, value, expected) => {
    expect(wrapToIecType(iecType, value)).toBe(expected);
  });

  it("leaves bits and floats alone", () => {
    expect(wrapToIecType("BOOL", 1)).toBe(1);
    expect(wrapToIecType("REAL", 1.25)).toBe(1.25);
    expect(wrapToIecType("LREAL", -0.1)).toBe(-0.1);
  });
});

describe("Int64 words", () => {
  it.each([0, 1, -1, 2 ** 32, -(2 ** 32) - 5, 2 ** 53, -(2 ** 53), 2 ** 62])(
    "round-trips %d",
    (value) => {
      const [high, low] = int64ToWords(value);
      expect(wordsToInt64(high, low)).toBe(value);
    },
  );

  it("writes -1 as two full words, the way a PLC stores it", () => {
    expect(int64ToWords(-1)).toEqual([0xffff_ffff, 0xffff_ffff]);
  });
});
