import type { Translate } from "../i18n/translate.ts";
import type { PositioningView } from "../inspector/positioning-view.ts";
import { button, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";

// The "Positionnement" section of the inspector (ADR 0039): thin DOM over
// inspector/positioning-view.ts. The tools run the same commands as the keys
// G, R and A of the Edit menu.

function toolRow(view: PositioningView, t: Translate, intents: PanelIntents): HTMLElement {
  const buttons = view.tools.map((tool) => {
    const created = button(tool.label, "positioning__tool", () =>
      intents.runMenuCommand(tool.command),
    );
    // So that a redraw of the inspector gives the focus back (ui/focus.ts).
    created.setAttribute("data-focus-key", `positioning-${tool.command}`);
    created.disabled = tool.disabled;
    created.setAttribute("aria-pressed", String(tool.pressed));
    return created;
  });
  return element(
    "div",
    {
      className: "inspector__create",
      attributes: { role: "group", "aria-label": t("positioning.toolsLabel") },
    },
    buttons,
  );
}

function stepInput(
  step: NonNullable<PositioningView["step"]>,
  intents: PanelIntents,
): HTMLInputElement {
  const input = element("input", {
    className: "gizmo-step",
    attributes: {
      type: "text",
      inputmode: "decimal",
      title: step.label,
      "aria-label": step.label,
      "data-focus-key": "positioning-step",
      value: step.value,
    },
  });
  input.addEventListener("change", () => intents.setGizmoStep(step.field, input.value));
  return input;
}

export function renderPositioning(
  view: PositioningView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  return element("section", { className: "positioning" }, [
    view.group === null
      ? element("h3", { className: "positioning__title", text: view.title })
      : renderPropertiesGrid([view.group], t, intents),
    view.bodyLine === null
      ? null
      : element("p", { className: "inspector__empty", text: view.bodyLine }),
    toolRow(view, t, intents),
    view.step === null ? null : stepInput(view.step, intents),
  ]);
}
