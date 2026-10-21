import { describe, expect, it } from "vitest";
import { modbusSymbolWarnings } from "./rules-symbols.ts";

const channel = (ioType: "BOOL" | "REAL" | "DINT") => ({
  tag: "a.b.c",
  variable: "v",
  comment: "",
  modbus: { zone: "coil", address: 0, ioType } as const,
});

describe("modbusSymbolWarnings", () => {
  it("is silent when the IEC type is the wire type, in any case", () => {
    const real = { iecType: "REAL", access: "read_write" } as const;
    const bool = { iecType: "bool", access: "read" } as const;
    expect(modbusSymbolWarnings(channel("REAL"), real)).toEqual([]);
    expect(modbusSymbolWarnings(channel("BOOL"), bool)).toEqual([]);
  });

  it("warns when the IEC type differs, an LREAL variable behind a REAL channel for one", () => {
    const warnings = modbusSymbolWarnings(channel("REAL"), {
      iecType: "LREAL",
      access: "read_write",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("REAL");
    expect(warnings[0]).toContain("LREAL");
  });

  it("ignores the access of the variable", () => {
    expect(modbusSymbolWarnings(channel("DINT"), { iecType: "DINT", access: "unknown" })).toEqual(
      [],
    );
    expect(modbusSymbolWarnings(channel("DINT"), { iecType: "DINT", access: "read" })).toEqual([]);
  });
});
