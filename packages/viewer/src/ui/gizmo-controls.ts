import type { SnapSteps } from "../gizmo/placement-snapping.ts";
import type { PanelView } from "../view-model.ts";
import { element, iconButton } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// "Déplacer" and "Tourner" of the toolbar (ADR 0034 point 3) and, while one is
// on, the two steps of the gizmo (point 5).

function stepInput(
  view: PanelView,
  intents: PanelIntents,
  field: keyof SnapSteps,
  label: string,
): HTMLElement {
  const input = element("input", {
    className: "gizmo-step",
    attributes: {
      type: "text",
      inputmode: "decimal",
      title: label,
      "aria-label": label,
      value: String(view.toolbar.gizmoSteps[field]),
    },
  });
  input.addEventListener("change", () => intents.setGizmoStep(field, input.value));
  return input;
}

export function gizmoControls(view: PanelView, intents: PanelIntents): HTMLElement[] {
  const { toolbar, translate } = view;
  const toggle = (command: "gizmoMove" | "gizmoRotate", pressed: boolean, label: string) => {
    const created = iconButton(
      command === "gizmoMove" ? "gizmo-move" : "gizmo-rotate",
      label,
      () => intents.runMenuCommand(command),
      !toolbar.gizmoAvailable,
    );
    created.setAttribute("aria-pressed", String(pressed));
    return created;
  };
  return [
    toggle("gizmoMove", toolbar.gizmoMode === "move", translate("toolbar.gizmoMove")),
    toggle("gizmoRotate", toolbar.gizmoMode === "rotate", translate("toolbar.gizmoRotate")),
    toolbar.gizmoMode === "move"
      ? stepInput(
          view,
          intents,
          "translationMillimetres",
          translate("toolbar.gizmoStepTranslation"),
        )
      : null,
    toolbar.gizmoMode === "rotate"
      ? stepInput(view, intents, "rotationDegrees", translate("toolbar.gizmoStepRotation"))
      : null,
  ].filter((control) => control !== null);
}
