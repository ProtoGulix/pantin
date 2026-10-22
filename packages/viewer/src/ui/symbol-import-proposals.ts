import type {
  ModuleProposalsView,
  ModuleProposalView,
} from "../io/symbol-module-proposals-view.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";

// The module proposals block of the symbol import dialog (ADR 0065 point 12). Each proposal says
// "to check" with a warning glyph and the sentence; Apply is its own button, not the dialog's.

function proposalItem(proposal: ModuleProposalView, intents: PanelIntents): HTMLElement {
  const apply = element("button", {
    className: "io-button",
    text: proposal.applyLabel,
    attributes: {
      type: "button",
      "aria-disabled": String(!proposal.applyEnabled),
      "data-focus-key": `proposal:${proposal.module}`,
    },
  });
  apply.addEventListener("click", () => {
    if (proposal.applyEnabled) {
      intents.applyModuleProposal(proposal.module);
    }
  });
  return element("li", { className: "symbol-row is-warning" }, [
    element("span", { className: "symbol-row__signal", text: proposal.title }),
    element("span", { className: "symbol-row__detail", text: proposal.prefixLine }),
    element("span", { className: "symbol-row__detail", text: proposal.reasonLine }),
    element("span", { className: "symbol-row__remark" }, glyphThenText("warning", proposal.remark)),
    apply,
  ]);
}

export function drawModuleProposals(view: ModuleProposalsView, intents: PanelIntents): HTMLElement {
  return element(
    "section",
    { className: "symbol-section", attributes: { "aria-labelledby": "symbol-section-modules" } },
    [
      element("h3", {
        className: "symbol-section__heading",
        text: view.heading,
        attributes: { id: "symbol-section-modules" },
      }),
      view.errorText === null
        ? null
        : element(
            "p",
            { className: "symbol-import__status is-failed", attributes: { role: "alert" } },
            glyphThenText("warning", view.errorText),
          ),
      view.errorDetail === null
        ? null
        : element("p", { className: "symbol-import__detail", text: view.errorDetail }),
      element(
        "ul",
        { className: "symbol-section__rows" },
        view.proposals.map((proposal) => proposalItem(proposal, intents)),
      ),
    ],
  );
}
