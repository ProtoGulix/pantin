import { describe, expect, it } from "vitest";
import {
  buildAssignments,
  defaultCheckedKeys,
  pickOptions,
  symbolImportRows,
  symbolRowKey,
} from "./symbol-import-rows.ts";
import { symbolImportReady, withRowToggled, withSymbolPicked } from "./symbol-import-state.ts";
import {
  INCOMPATIBLE,
  SURE_ONE,
  SURE_TWO,
  SYMBOL_PREVIEW,
  TO_CHECK,
} from "./symbol-import-test-fixtures.ts";

const HOME_KEY = symbolRowKey({ module: "m1", tag: "main.rod.home" });

describe("symbol import rows", () => {
  it("separates sure matches from those to check, and keeps the others apart", () => {
    const rows = symbolImportRows(SYMBOL_PREVIEW);
    expect(rows.matched).toEqual([SURE_ONE, SURE_TWO]);
    expect(rows.toCheck).toEqual([TO_CHECK, INCOMPATIBLE]);
    expect(rows.unchanged).toHaveLength(1);
    expect(rows.unmatched).toHaveLength(1);
  });

  it("checks the sure matches and nothing else at the start", () => {
    expect([...defaultCheckedKeys(SYMBOL_PREVIEW)]).toEqual([
      symbolRowKey(SURE_ONE),
      symbolRowKey(SURE_TWO),
    ]);
  });

  it("builds a payload with exactly the checked rows", () => {
    const checked = new Set([symbolRowKey(SURE_TWO), symbolRowKey(TO_CHECK)]);
    expect(buildAssignments(SYMBOL_PREVIEW, checked, new Map())).toEqual([
      { module: "m1", tag: "main.valve.retract", variable: "GVL.valve_retract" },
      { module: "m1", tag: "main.rod.position", variable: "GVL.rod_position" },
    ]);
  });

  it("never sends a row whose type is incompatible, even if it was checked", () => {
    const checked = new Set([symbolRowKey(INCOMPATIBLE)]);
    expect(buildAssignments(SYMBOL_PREVIEW, checked, new Map())).toEqual([]);
  });

  it("adds the variable chosen in a picker", () => {
    const picks = new Map([[HOME_KEY, "GVL.spare_input"]]);
    expect(buildAssignments(SYMBOL_PREVIEW, new Set(), picks)).toEqual([
      { module: "m1", tag: "main.rod.home", variable: "GVL.spare_input" },
    ]);
  });

  it("ignores a picker choice that is not on offer", () => {
    const picks = new Map([[HOME_KEY, "GVL.@odd"]]);
    expect(buildAssignments(SYMBOL_PREVIEW, new Set(), picks)).toEqual([]);
  });

  it("offers the unused symbols that no signal took, not the unusable ones", () => {
    const signal = SYMBOL_PREVIEW.unmatchedSignals[0];
    if (signal === undefined) {
      throw new Error("The fixture has lost its unmatched signal.");
    }
    const offered = pickOptions(SYMBOL_PREVIEW, signal);
    expect(offered.map((symbol) => symbol.reference)).toEqual(["GVL.spare_input"]);
  });
});

describe("symbol import state", () => {
  it("toggles a row, and leaves an incompatible row alone", () => {
    const start = symbolImportReady("symbols.xml", SYMBOL_PREVIEW);
    const unchecked = withRowToggled(start, symbolRowKey(SURE_ONE));
    const toggledIncompatible = withRowToggled(unchecked, symbolRowKey(INCOMPATIBLE));
    expect(unchecked.status === "ready" && unchecked.checked.has(symbolRowKey(SURE_ONE))).toBe(
      false,
    );
    expect(toggledIncompatible).toBe(unchecked);
  });

  it("clears a picker choice with an empty reference", () => {
    const start = symbolImportReady("symbols.xml", SYMBOL_PREVIEW);
    const chosen = withSymbolPicked(start, HOME_KEY, "GVL.spare_input");
    const cleared = withSymbolPicked(chosen, HOME_KEY, "");
    expect(chosen.status === "ready" && chosen.picks.get(HOME_KEY)).toBe("GVL.spare_input");
    expect(cleared.status === "ready" && cleared.picks.size).toBe(0);
  });
});
