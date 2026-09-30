import type { Translate } from "../i18n/translate.ts";
import type {
  SensorCardView,
  SensorFormView,
  SensorSectionView,
} from "../panel/sensor-panel-model.ts";
import { button, element, selectInput } from "./dom.ts";
import { checkbox, field, formInput, valueSpan } from "./panel-fields.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderSwitchDiagram } from "./switch-diagram.ts";

// The sensors section of the right-hand panel (ADR 0023): wiring sensors to
// joints, and reading their tags as a PLC would. Their values are written in
// place by the panel's showTagValues, like the drives' feedback.

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

function renderForm(form: SensorFormView, t: Translate, intents: PanelIntents): HTMLElement {
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

function renderCard(card: SensorCardView, t: Translate, intents: PanelIntents): HTMLElement {
  const tags = card.tags.map((tag) =>
    element("div", { className: "drive-panel__row", attributes: { title: tag.name } }, [
      element("span", { text: tag.label }),
      valueSpan(tag.name, null),
    ]),
  );
  return element(
    "section",
    { className: "drive-panel__card", attributes: { "aria-label": card.name } },
    [
      element("div", { className: "drive-panel__card-head" }, [
        element("strong", { text: card.name }),
        element("span", {
          className: "drive-panel__detail",
          text: `${card.typeLabel} · ${card.tagPrefix}`,
        }),
      ]),
      element("div", { className: "drive-panel__detail", text: card.watches }),
      element("div", { className: "drive-panel__actions" }, [
        button(t("drives.edit"), "button", () => intents.openSensorForm(card.id)),
        button(t("drives.delete"), "button", () => intents.deleteSensor(card.id)),
      ]),
      ...tags,
    ],
  );
}

export function renderSensorSection(
  view: SensorSectionView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const create = button(t("sensors.new"), "button", () => intents.openSensorForm(null));
  create.disabled = !view.canCreate;
  return element(
    "section",
    { className: "drive-panel__section", attributes: { "aria-label": view.title } },
    [
      element("div", { className: "drive-panel__head" }, [
        element("h3", { className: "drive-panel__title", text: view.title }),
        create,
      ]),
      view.form === null ? null : renderForm(view.form, t, intents),
      view.sensors.length === 0 && view.canCreate
        ? element("p", { className: "drive-panel__empty", text: t("sensors.empty") })
        : null,
      ...view.sensors.map((card) => renderCard(card, t, intents)),
    ],
  );
}
