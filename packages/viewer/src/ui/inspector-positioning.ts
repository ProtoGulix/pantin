import type { Translate } from "../i18n/translate.ts";
import type { PositioningView } from "../inspector/positioning-view.ts";
import { element } from "./dom.ts";
import { renderAlignment } from "./inspector-alignment.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";

// The "Positionnement" section of the inspector (ADR 0039): thin DOM over
// inspector/positioning-view.ts. Its tools and the gizmo step sit in the
// inspector's tool bar (inspector-toolbar.ts), with the other tools.

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
    view.alignment === null ? null : renderAlignment(view.alignment, t, intents),
  ]);
}
