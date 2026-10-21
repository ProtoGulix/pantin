import { describe, expect, it } from "vitest";
import { MODBUS_TCP_SLAVE_RULES } from "./rules.ts";
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

describe("the Modbus rules hook, which is given the direction too", () => {
  it("answers as modbusSymbolWarnings does, whatever the access and the direction", () => {
    const real = channel("REAL");
    for (const access of ["read", "write", "read_write", "unknown"] as const) {
      for (const direction of ["command", "feedback"] as const) {
        for (const iecType of ["REAL", "LREAL"]) {
          const symbol = { iecType, access };
          expect(
            MODBUS_TCP_SLAVE_RULES.symbolWarnings(real, symbol, { type: "float", direction }),
          ).toEqual(modbusSymbolWarnings(real, symbol));
        }
      }
    }
  });
});
