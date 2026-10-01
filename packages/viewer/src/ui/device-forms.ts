import type { Translate } from "../i18n/translate.ts";
import type { ActuatorFormView } from "../panel/actuator-form-model.ts";
import type { DriveFormView } from "../panel/drive-form-model.ts";
import type { SensorFormView } from "../panel/sensor-form-model.ts";
import { button, element, selectInput } from "./dom.ts";
import { checkbox, field, formInput } from "./panel-fields.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderSwitchDiagram } from "./switch-diagram.ts";

// The creation and edit forms of drives, actuators and sensors, at the head of
// the inspector (ADR 0022, 0023, 0028). Creating a device stays a form, since
// nothing is selected yet; editing one is the way to change its type.

function renderDriveParameters(form: DriveFormView, intents: PanelIntents) {
  const inputs = form.parameters.map((parameter) =>
    field(
      parameter.unit === null ? parameter.label : `${parameter.label} (${parameter.unit})`,
      formInput(`drive-${parameter.field}`, parameter.value, parameter.label, (text) =>
        intents.editDriveParameter(parameter.field, text),
      ),
    ),
  );
  const hint =
    form.unitHint === null
      ? null
      : element("p", { className: "inspector__detail", text: form.unitHint });
  return [hint, ...inputs];
}

export function renderDriveForm(
  form: DriveFormView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const confirm = button(form.confirmLabel, "button button--primary", intents.submitDriveForm);
  confirm.disabled = !form.canSubmit;
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": form.title } },
    [
      element("div", { className: "inline-form__title", text: form.title }),
      field(
        t("drives.form.name"),
        formInput("drive-name", form.name, t("drives.form.name"), intents.editDriveName),
      ),
      field(
        t("drives.form.type"),
        selectInput(form.typeOptions, form.type, t("drives.form.type"), intents.changeDriveType),
      ),
      field(
        t("drives.form.assembly"),
        selectInput(
          form.assemblyOptions,
          form.assembly,
          t("drives.form.assembly"),
          intents.changeDriveAssembly,
        ),
      ),
      ...renderDriveParameters(form, intents),
      element("div", { className: "inline-form__actions" }, [
        button(t("joint.form.cancel"), "button", intents.cancelDriveForm),
        confirm,
      ]),
    ],
  );
}

function renderFeedFields(form: ActuatorFormView, t: Translate, intents: PanelIntents) {
  const drive = field(
    t("actuators.form.drive"),
    selectInput(
      form.driveOptions,
      form.drive,
      t("actuators.form.drive"),
      intents.changeActuatorDrive,
    ),
  );
  const hint = form.noFittingDrive
    ? element("p", { className: "inspector__empty", text: t("actuators.form.noFittingDrive") })
    : null;
  const ports = form.ports.map((port) =>
    field(
      port.label,
      selectInput(port.options, port.value, port.label, (output) =>
        intents.changeActuatorPort(port.name, output),
      ),
    ),
  );
  return [drive, hint, ...ports];
}

function renderActuatorParameters(form: ActuatorFormView, intents: PanelIntents) {
  return form.parameters.map((parameter) =>
    field(
      parameter.unit === null ? parameter.label : `${parameter.label} (${parameter.unit})`,
      formInput(`actuator-${parameter.field}`, parameter.value, parameter.label, (text) =>
        intents.editActuatorParameter(parameter.field, text),
      ),
    ),
  );
}

function renderIdentityFields(form: ActuatorFormView, t: Translate, intents: PanelIntents) {
  return [
    field(
      t("drives.form.name"),
      formInput("actuator-name", form.name, t("drives.form.name"), intents.editActuatorName),
    ),
    field(
      t("drives.form.type"),
      selectInput(form.typeOptions, form.type, t("drives.form.type"), intents.changeActuatorType),
    ),
    field(
      t("drives.form.assembly"),
      selectInput(
        form.assemblyOptions,
        form.assembly,
        t("drives.form.assembly"),
        intents.changeActuatorAssembly,
      ),
    ),
  ];
}

export function renderActuatorForm(
  form: ActuatorFormView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const confirm = button(form.confirmLabel, "button button--primary", intents.submitActuatorForm);
  confirm.disabled = !form.canSubmit;
  const parts = [
    element("div", { className: "inline-form__title", text: form.title }),
    ...renderIdentityFields(form, t, intents),
    ...renderFeedFields(form, t, intents),
    element("div", { className: "inline-field__label", text: t("actuators.form.joints") }),
    ...form.joints.map((joint) =>
      checkbox(joint.label, joint.checked, (checked) =>
        intents.toggleActuatorJoint(joint.id, checked),
      ),
    ),
    ...renderActuatorParameters(form, intents),
    element("div", { className: "inline-form__actions" }, [
      button(t("joint.form.cancel"), "button", intents.cancelActuatorForm),
      confirm,
    ]),
  ];
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": form.title } },
    parts.filter((part) => part !== null),
  );
}

function renderInput(input: SensorFormView["inputs"][number], intents: PanelIntents) {
  const edit = (text: string) => intents.editSensorParameter(input.key, text);
  switch (input.input) {
    case "checkbox":
      return checkbox(input.label, input.value === "true", (on) => edit(String(on)));
    case "select":
      return field(input.label, selectInput(input.options, input.value, input.label, edit));
    case "text":
      return field(input.label, formInput(`sensor-${input.key}`, input.value, input.label, edit));
  }
}

function renderInputs(form: SensorFormView, intents: PanelIntents): HTMLElement[] {
  return form.inputs.map((input) => renderInput(input, intents));
}

export function renderSensorForm(
  form: SensorFormView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const confirm = button(form.confirmLabel, "button button--primary", intents.submitSensorForm);
  confirm.disabled = !form.canSubmit;
  const select = (
    label: string,
    options: SensorFormView["typeOptions"],
    value: string,
    onChange: (value: string) => void,
  ) => field(label, selectInput(options, value, label, onChange));
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": form.title } },
    [
      element("div", { className: "inline-form__title", text: form.title }),
      field(
        t("drives.form.name"),
        formInput("sensor-name", form.name, t("drives.form.name"), intents.editSensorName),
      ),
      select(t("drives.form.type"), form.typeOptions, form.type, intents.changeSensorType),
      select(t("sensors.form.joint"), form.jointOptions, form.joint, intents.changeSensorJoint),
      select(
        t("drives.form.assembly"),
        form.assemblyOptions,
        form.assembly,
        intents.changeSensorAssembly,
      ),
      form.diagram === null ? null : renderSwitchDiagram(form.diagram),
      ...renderInputs(form, intents),
      element("div", { className: "inline-form__actions" }, [
        button(t("joint.form.cancel"), "button", intents.cancelSensorForm),
        confirm,
      ]),
    ],
  );
}
