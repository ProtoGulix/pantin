import { describe, expect, it } from "vitest";
import { assessTypeCompatibility, canCarryAnySignal } from "./symbol-compatibility.ts";

// The type table of ADR 0064 point 12, row by row.

describe("assessTypeCompatibility", () => {
  it.each([
    ["bit", "BOOL"],
    ["float", "REAL"],
    ["float", "LREAL"],
    ["integer", "DINT"],
    ["integer", "LINT"],
  ] as const)("a %s signal is carried by %s without a warning", (signalType, iecType) => {
    expect(assessTypeCompatibility(signalType, iecType)).toEqual({
      compatibility: "compatible",
      warnings: [],
    });
  });

  it.each(["INT", "SINT", "UDINT", "UINT", "USINT", "ULINT", "BYTE", "WORD", "DWORD", "LWORD"])(
    "an integer signal in %s is carried with a warning about range and sign",
    (iecType) => {
      const assessment = assessTypeCompatibility("integer", iecType);
      expect(assessment.compatibility).toBe("warning");
      expect(assessment.warnings).toHaveLength(1);
      expect(assessment.warnings[0]).toContain(iecType);
    },
  );

  it.each([
    ["bit", "INT"],
    ["bit", "REAL"],
    ["float", "BOOL"],
    ["float", "INT"],
    ["float", "DINT"],
    ["integer", "BOOL"],
    ["integer", "REAL"],
    ["integer", "STRING"],
    ["bit", "TIME"],
    ["integer", "ARRAY [0..10] OF INT"],
    ["integer", "POINTER TO BYTE"],
    ["bit", "Point"],
    ["float", "EthernetState"],
  ] as const)("a %s signal is never carried by %s", (signalType, iecType) => {
    expect(assessTypeCompatibility(signalType, iecType)).toEqual({
      compatibility: "incompatible",
      warnings: [],
    });
  });

  it("reads IEC type names without regard to case or surrounding space", () => {
    expect(assessTypeCompatibility("bit", " bool ").compatibility).toBe("compatible");
    expect(assessTypeCompatibility("integer", "int").compatibility).toBe("warning");
  });
});

describe("canCarryAnySignal", () => {
  it("is true for the types of the table and false for the others", () => {
    expect(canCarryAnySignal("BOOL")).toBe(true);
    expect(canCarryAnySignal("WORD")).toBe(true);
    expect(canCarryAnySignal("STRING")).toBe(false);
    expect(canCarryAnySignal("ARRAY [0..3] OF BYTE")).toBe(false);
  });
});
