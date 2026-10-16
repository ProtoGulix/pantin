import type { Translate } from "../i18n/translate.ts";
import type { IoProblemItem, IoView } from "../io/io-view-model.ts";
import { button, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The problems at the top of the I/O view. One with a cell is a button that
// leads to it; a whole-file one is text only (ADR 0049 point 11).

function problemEntry(
  problem: IoProblemItem,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const { cellId } = problem;
  if (cellId === null) {
    const text = translate("io.problems.wholeFileItem", { message: problem.message });
    return element("li", { className: "io-problem io-problem--file", text });
  }
  const go = button(problem.message, "io-problem__go", () =>
    intents.focusIoProblem(problem.moduleKey, cellId),
  );
  go.title = translate("io.problems.goTo");
  return element("li", { className: "io-problem" }, [go]);
}

export function drawProblemList(
  view: IoView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement | null {
  if (view.problems.length === 0) {
    return null;
  }
  const title = translate("io.problems.title", { count: view.problems.length });
  return element("section", { className: "io-problems", attributes: { "aria-label": title } }, [
    element("h2", { className: "io-view__title", text: title }),
    element(
      "ul",
      { className: "io-problems__list" },
      view.problems.map((problem) => problemEntry(problem, translate, intents)),
    ),
  ]);
}
