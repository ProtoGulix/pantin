import type { DriveRuntime } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import type { InspectorView } from "../inspector/inspector-model.ts";
import type { LiveSource } from "../properties/property-rows.ts";
import { renderActuatorForm, renderDriveForm, renderSensorForm } from "./device-forms.ts";
import { button, element, iconButton } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { showInspectorLive } from "./inspector-live.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";
import { deleteDevice, editDevice } from "./row-actions.ts";

// The right-hand panel (ADR 0030): the inspector of what is selected. The
// buttons that create devices stay at its head in every case; below them the
// form being filled, then the "Property | Value" grid of the selection. Redrawn
// from its view on every change; its live cells are written in place by
// showLive, several times a second.

function createButtons(view: InspectorView, t: Translate, intents: PanelIntents): HTMLElement {
  const newActuator = button(t("actuators.new"), "button", () => intents.openActuatorForm(null));
  const newSensor = button(t("sensors.new"), "button", () => intents.openSensorForm(null));
  newActuator.disabled = !view.canCreateActuator;
  newSensor.disabled = !view.canCreateSensor;
  if (!view.canCreateActuator) {
    // Both need a joint that moves: say why they are off.
    newActuator.title = t("actuators.noMovableJoint");
    newSensor.title = t("actuators.noMovableJoint");
  }
  return element("div", { className: "inspector__create" }, [
    button(t("drives.new"), "button", () => intents.openDriveForm(null)),
    newActuator,
    newSensor,
  ]);
}

function deviceButtons(view: InspectorView, t: Translate, intents: PanelIntents) {
  const { device } = view;
  return device === null
    ? null
    : element("div", { className: "inspector__create" }, [
        button(t("drives.edit"), "button", () => editDevice(device, intents)),
        button(t("drives.delete"), "button", () => deleteDevice(device, intents)),
      ]);
}

function formsOf(view: InspectorView, t: Translate, intents: PanelIntents) {
  return [
    view.driveForm === null ? null : renderDriveForm(view.driveForm, t, intents),
    view.actuatorForm === null ? null : renderActuatorForm(view.actuatorForm, t, intents),
    view.sensorForm === null ? null : renderSensorForm(view.sensorForm, t, intents),
  ];
}

export class Inspector {
  private readonly root: HTMLElement;
  private translate: Translate | null = null;
  private live: ReadonlyMap<string, LiveSource> = new Map();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  render(view: InspectorView, t: Translate, intents: PanelIntents): void {
    this.translate = t;
    this.live = view.live;
    this.root.hidden = !view.open;
    if (!view.open) {
      this.root.replaceChildren();
      return;
    }
    const focus = captureFocus(this.root);
    this.root.setAttribute("aria-label", view.title);
    this.root.replaceChildren(
      ...[
        element("div", { className: "inspector__head" }, [
          element("h2", { className: "inspector__title", text: view.title }),
          iconButton("close", t("joint.form.cancel"), intents.toggleInspector),
        ]),
        createButtons(view, t, intents),
        ...formsOf(view, t, intents),
        view.subject === null
          ? null
          : element("h3", { className: "inspector__subject", text: view.subject }),
        deviceButtons(view, t, intents),
        view.note === null
          ? renderPropertiesGrid(view.groups, t, intents)
          : element("p", { className: "inspector__empty", text: view.note }),
        ...view.hints.map((hint) => element("p", { className: "inspector__empty", text: hint })),
      ].filter((part) => part !== null),
    );
    restoreFocus(this.root, focus);
  }

  /** SI values from the core, shown in mm or degrees; bits as On or Off. */
  showLive(tags: ReadonlyMap<string, number>, runtime: ReadonlyMap<string, DriveRuntime>): void {
    if (this.translate !== null) {
      showInspectorLive(this.root, this.live, tags, runtime, this.translate);
    }
  }
}
