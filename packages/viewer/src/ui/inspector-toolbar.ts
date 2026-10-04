import type { Translate } from "../i18n/translate.ts";
import type { InspectorView } from "../inspector/inspector-model.ts";
import type { PositioningView } from "../inspector/positioning-view.ts";
import { element, iconButton } from "./dom.ts";
import type { IconName } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { deleteDevice, editDevice } from "./row-actions.ts";

// The one tool bar of the inspector, under its title: the buttons that create
// a device, then those that place the selection, then those that act on the
// selected device, as icons separated by a thin line. A group that does not
// apply to the selection is left out; the tooltip of each icon is its name.

type PositioningCommand = PositioningView["tools"][number]["command"];

const POSITIONING_ICONS: Readonly<Record<PositioningCommand, IconName>> = {
  gizmoMove: "move",
  gizmoRotate: "rotate",
  align: "align",
};

function separator(): HTMLElement {
  return element("span", { className: "toolbar__separator", attributes: { role: "separator" } });
}

function createGroup(view: InspectorView, t: Translate, intents: PanelIntents): HTMLElement[] {
  const newActuator = iconButton("add-actuator", t("actuators.new"), () =>
    intents.openActuatorForm(null),
  );
  const newSensor = iconButton("add-sensor", t("sensors.new"), () => intents.openSensorForm(null));
  newActuator.disabled = !view.canCreateActuator;
  newSensor.disabled = !view.canCreateSensor;
  if (!view.canCreateActuator) {
    // Both need a joint that moves: the tooltip says why they are off.
    const reason = t("actuators.noMovableJoint");
    newActuator.title = t("inspector.disabledTool", { name: t("actuators.new"), reason });
    newSensor.title = t("inspector.disabledTool", { name: t("sensors.new"), reason });
  }
  return [
    iconButton("add-drive", t("drives.new"), () => intents.openDriveForm(null)),
    newActuator,
    newSensor,
  ];
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

// The same commands as the keys G, R and A of the Edit menu (ADR 0039).
function positioningGroup(view: PositioningView, intents: PanelIntents): HTMLElement[] {
  const tools = view.tools.map((tool) => {
    const created = iconButton(
      POSITIONING_ICONS[tool.command],
      tool.label,
      () => intents.runMenuCommand(tool.command),
      tool.disabled,
    );
    // So that a redraw of the inspector gives the focus back (ui/focus.ts).
    created.setAttribute("data-focus-key", `positioning-${tool.command}`);
    created.setAttribute("aria-pressed", String(tool.pressed));
    return created;
  });
  return view.step === null ? tools : [...tools, stepInput(view.step, intents)];
}

function deviceGroup(view: InspectorView, t: Translate, intents: PanelIntents): HTMLElement[] {
  const { device } = view;
  return device === null
    ? []
    : [
        iconButton("edit", t("drives.edit"), () => editDevice(device, intents)),
        iconButton("delete", t("drives.delete"), () => deleteDevice(device, intents)),
      ];
}

export function renderInspectorToolbar(
  view: InspectorView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const groups = [
    createGroup(view, t, intents),
    view.positioning === null ? [] : positioningGroup(view.positioning, intents),
    deviceGroup(view, t, intents),
  ].filter((group) => group.length > 0);
  return element(
    "div",
    {
      className: "inspector__toolbar",
      attributes: { role: "toolbar", "aria-label": t("inspector.toolsLabel") },
    },
    groups.flatMap((group, index) => (index === 0 ? group : [separator(), ...group])),
  );
}
