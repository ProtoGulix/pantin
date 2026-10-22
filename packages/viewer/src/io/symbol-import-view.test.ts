import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { symbolRowKey } from "./symbol-import-rows.ts";
import { symbolImportReady, withRowToggled } from "./symbol-import-state.ts";
import { SURE_ONE, SYMBOL_PREVIEW, TO_CHECK } from "./symbol-import-test-fixtures.ts";
import { buildSymbolImportView } from "./symbol-import-view.ts";

const english = createTranslator("en");
const french = createTranslator("fr");
const ready = symbolImportReady("symbols.xml", SYMBOL_PREVIEW);

describe("the symbol import view", () => {
  it("is hidden while closed", () => {
    expect(buildSymbolImportView({ status: "closed" }, english).visible).toBe(false);
  });

  it("lists the sections in order with their counts", () => {
    const view = buildSymbolImportView(ready, english);
    expect(view.sections.map((section) => [section.id, section.rows.length])).toEqual([
      ["matched", 2],
      ["toCheck", 2],
      ["unchanged", 1],
      ["unmatched", 1],
      ["unused", 2],
    ]);
    expect(view.sections.map((section) => section.heading)).toEqual([
      "Sure matches (2)",
      "To check (2)",
      "Unchanged (1)",
      "Signals without a match (1)",
      "Unused symbols (2)",
    ]);
  });

  it("starts with the sure matches checked and the others unchecked", () => {
    const view = buildSymbolImportView(ready, english);
    const checks = view.sections.flatMap((section) =>
      section.rows.map((row) => row.checkbox?.checked),
    );
    expect(checks.slice(0, 4)).toEqual([true, true, false, undefined]);
  });

  it("states the match kind and the warnings in words, not only by tone", () => {
    const view = buildSymbolImportView(ready, english);
    const toCheck = view.sections.find((section) => section.id === "toCheck");
    const suffix = toCheck?.rows[0];
    expect(suffix?.details).toContain("Match: end of the name recognised (key and member)");
    expect(suffix?.remarks).toEqual([
      "The OPC UA channel is REAL but the PLC variable is INT: change the type of the PLC variable to REAL.",
    ]);
    expect(suffix?.tone).toBe("warning");
    expect(toCheck?.rows[1]?.remarks).toEqual(["Incompatible type: this row will not be applied."]);
    expect(toCheck?.rows[1]?.checkbox).toBeNull();
  });

  it("updates the count of variables to apply when a checkbox changes", () => {
    expect(buildSymbolImportView(ready, english).summary).toBe("Variables to apply: 2");
    const unchecked = withRowToggled(ready, symbolRowKey(SURE_ONE));
    expect(buildSymbolImportView(unchecked, english).summary).toBe("Variables to apply: 1");
    const checked = withRowToggled(unchecked, symbolRowKey(TO_CHECK));
    expect(buildSymbolImportView(checked, english).summary).toBe("Variables to apply: 2");
  });

  it("offers the free symbols in the picker of an unmatched signal, with its type", () => {
    const view = buildSymbolImportView(ready, french);
    const picker = view.sections.find((section) => section.id === "unmatched")?.rows[0]?.picker;
    expect(picker?.options).toEqual([{ value: "GVL.spare_input", text: "GVL.spare_input (BOOL)" }]);
    expect(picker?.label).toBe("Variable pour m1 / main.rod.home");
  });

  it("disables Apply when nothing is checked", () => {
    const empty = withRowToggled(
      withRowToggled(ready, symbolRowKey(SURE_ONE)),
      "m1\u0000main.valve.retract",
    );
    expect(buildSymbolImportView(empty, english).applyEnabled).toBe(false);
  });
});
