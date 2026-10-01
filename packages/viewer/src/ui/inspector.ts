import type { DriveRuntime } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import type { InspectorView } from "../inspector/inspector-model.ts";
import type { LiveSource } from "../properties/property-rows.ts";
import { renderActuatorForm, renderDriveForm, renderSensorForm } from "./device-forms.ts";
import { button, element, iconButton } from "./dom.ts";
import { captureFocus, focusField, restoreFocus } from "./focus.ts";
import { showInspectorLive } from "./inspector-live.ts";
import { renderJointForm } from "./joint-form.ts";
import { JointSliderControl } from "./joint-slider.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";
import { deleteDevice, editDevice } from "./row-actions.ts";

// The right-hand panel (ADR 0030): the inspector of what is selected, the only
// properties panel. The buttons that create devices stay at its head in every
// case; below them the form being filled, then the "Property | Value" grid of
// the selection. Redrawn from its view on every change; its live cells are
// written in place by showLive, several times a second. A joint's slider sits
// between the two redrawn parts and is never rebuilt, so that a redraw cannot
// interrupt a drag (joint-slider.ts).

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
    view.jointForm === null ? null : renderJointForm(view.jointForm, t, intents),
    view.driveForm === null ? null : renderDriveForm(view.driveForm, t, intents),
    view.actuatorForm === null ? null : renderActuatorForm(view.actuatorForm, t, intents),
    view.sensorForm === null ? null : renderSensorForm(view.sensorForm, t, intents),
  ];
}

export class Inspector {
  private readonly root: HTMLElement;
  private readonly upper = element("div", { className: "inspector__part" });
  private readonly jointSlider = new JointSliderControl();
  private readonly lower = element("div", { className: "inspector__part" });
  private translate: Translate | null = null;
  private live: ReadonlyMap<string, LiveSource> = new Map();
  // A redraw must not take the focus back to a field the user has left.
  private servedFocusSerial = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.replaceChildren(this.upper, this.jointSlider.element, this.lower);
  }

  render(view: InspectorView, t: Translate, intents: PanelIntents): void {
    this.translate = t;
    this.live = view.live;
    this.root.hidden = !view.open;
    this.jointSlider.render(view.jointSlider, t, intents);
    if (!view.open) {
      this.upper.replaceChildren();
      this.lower.replaceChildren();
      return;
    }
    const focus = captureFocus(this.root);
    this.root.setAttribute("aria-label", view.title);
    this.upper.replaceChildren(
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
      ].filter((part) => part !== null),
    );
    this.lower.replaceChildren(
      view.note === null
        ? renderPropertiesGrid(view.groups, t, intents)
        : element("p", { className: "inspector__empty", text: view.note }),
      ...view.hints.map((hint) => element("p", { className: "inspector__empty", text: hint })),
    );
    restoreFocus(this.root, focus);
    this.serveFocusRequest(view.focusRequest);
  }

  private serveFocusRequest(request: InspectorView["focusRequest"]): void {
    if (request !== null && request.serial !== this.servedFocusSerial) {
      this.servedFocusSerial = request.serial;
      focusField(this.root, request.key);
    }
  }

  showJointPositions(positions: ReadonlyMap<string, number>): void {
    this.jointSlider.showPositions(positions);
  }

  /** SI values from the core, shown in mm or degrees; bits as On or Off. */
  showLive(tags: ReadonlyMap<string, number>, runtime: ReadonlyMap<string, DriveRuntime>): void {
    if (this.translate !== null) {
      showInspectorLive(this.root, this.live, tags, runtime, this.translate);
    }
  }
}
