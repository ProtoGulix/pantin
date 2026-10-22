import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { errorMessage } from "../messages.ts";
import {
  symbolImportReady,
  withProposalApplied,
  withProposalApplying,
  withProposalRefused,
} from "./symbol-import-state.ts";
import { SYMBOL_PREVIEW } from "./symbol-import-test-fixtures.ts";
import { buildSymbolImportView } from "./symbol-import-view.ts";

const preview = {
  ...SYMBOL_PREVIEW,
  moduleProposals: [
    { module: "plc", nodeIdPrefix: "|var|PLC.Application.", reason: "from_project_info" as const },
  ],
};
const en = createTranslator("en");
const fr = createTranslator("fr");

describe("the module proposals of the symbol import", () => {
  it("shows no block when the file proposes nothing", () => {
    const view = buildSymbolImportView(symbolImportReady("a.xml", SYMBOL_PREVIEW), en);
    expect(view.moduleProposals).toBeNull();
  });

  it("marks a proposal as to check, in words, with an apply action of its own", () => {
    const view = buildSymbolImportView(symbolImportReady("a.xml", preview), fr);
    const proposal = view.moduleProposals?.proposals[0];
    expect(proposal).toMatchObject({
      module: "plc",
      title: "Module plc",
      prefixLine: "Préfixe du NodeId proposé : |var|PLC.Application.",
      remark: expect.stringContaining("À vérifier"),
      applyEnabled: true,
    });
    expect(proposal?.applyLabel).toContain("plc");
    expect(
      buildSymbolImportView(symbolImportReady("a.xml", preview), en).moduleProposals?.proposals[0]
        ?.remark,
    ).toContain("To check");
  });

  it("does not count as a variable to apply", () => {
    const view = buildSymbolImportView(symbolImportReady("a.xml", preview), en);
    expect(view.summary).toBe("Variables to apply: 2");
  });

  it("disables the actions while one is sent, and drops the proposal once applied", () => {
    const ready = symbolImportReady("a.xml", preview);
    const busy = buildSymbolImportView(withProposalApplying(ready, "plc"), en);
    expect(busy.moduleProposals?.proposals[0]?.applyEnabled).toBe(false);
    const done = withProposalApplied(withProposalApplying(ready, "plc"), "plc");
    expect(buildSymbolImportView(done, en).moduleProposals).toBeNull();
  });

  it("says when the core refused it", () => {
    const refused = withProposalRefused(
      symbolImportReady("a.xml", preview),
      errorMessage("error.network", {}, "boom"),
    );
    const view = buildSymbolImportView(refused, en).moduleProposals;
    expect(view?.errorText).toContain("refused");
    expect(view?.errorDetail).toBe("boom");
    expect(view?.proposals[0]?.applyEnabled).toBe(true);
  });
});
