import { PLC_SYMBOL_ACCESSES, type PlcSymbolAccess } from "@pantin/plc-symbol-formats/model";
import { SYMBOL_ACCESSES } from "@pantin/protocol";
import type { SymbolShape } from "@pantin/transport-types/rules";
import { describe, expect, expectTypeOf, it } from "vitest";

// Three packages spell the access of a PLC variable, because none may import another
// (ADR 0064 point 10): the core is the one place that sees them all and keeps them equal.

describe("the access of a PLC symbol", () => {
  it("has the same values in the symbol model and in the protocol", () => {
    expect([...SYMBOL_ACCESSES]).toEqual([...PLC_SYMBOL_ACCESSES]);
  });

  it("has the same type in the transport rules", () => {
    expectTypeOf<SymbolShape["access"]>().toEqualTypeOf<PlcSymbolAccess>();
  });
});
