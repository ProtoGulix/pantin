import type { Translate } from "../i18n/translate.ts";
import type { ConveyorFormView, ConveyorInputView } from "../panel/conveyor-form-model.ts";
import { button, element, selectInput } from "./dom.ts";
import { checkbox, field, formInput } from "./panel-fields.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The creation and edit form of a belt, guide, emitter, absorber or presence
// sensor, at the head of the inspector (ADR 0043 point 13). Its inputs are
// described by the view (panel/conveyor-form-model.ts); this only draws them.

function renderInput(input: ConveyorInputView, intents: PanelIntents): HTMLElement {
  const edit = (text: string) => intents.editConveyorField(input.key, text);
  switch (input.input) {
    case "checkbox":
      return checkbox(input.label, input.value === "true", (on) => edit(String(on)));
    case "select":
      return field(input.label, selectInput(input.options, input.value, input.label, edit));
    case "text":
      return field(input.label, formInput(`conveyor-${input.key}`, input.value, input.label, edit));
  }
}

function identityFields(form: ConveyorFormView, t: Translate, intents: PanelIntents) {
  return [
    field(
      t("drives.form.name"),
      formInput("conveyor-name", form.name, t("drives.form.name"), (text) =>
        intents.editConveyorField("name", text),
      ),
    ),
    form.typeOptions.length === 0
      ? null
      : field(
          t("drives.form.type"),
          selectInput(
            form.typeOptions,
            form.type,
            t("drives.form.type"),
            intents.changeConveyorType,
          ),
        ),
    field(
      t("conveyors.form.assembly"),
      selectInput(
        form.assemblyOptions,
        form.assembly,
        t("conveyors.form.assembly"),
        intents.changeConveyorAssembly,
      ),
    ),
    field(
      t("conveyors.form.body"),
      selectInput(
        form.bodyOptions,
        form.body,
        t("conveyors.form.body"),
        intents.changeConveyorBody,
      ),
    ),
  ];
}

export function renderConveyorForm(
  form: ConveyorFormView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const confirm = button(form.confirmLabel, "button button--primary", intents.submitConveyorForm);
  confirm.disabled = !form.canSubmit;
  const parts = [
    element("div", { className: "inline-form__title", text: form.title }),
    ...identityFields(form, t, intents),
    element("div", { className: "inline-field__label", text: form.placementTitle }),
    ...form.placementInputs.map((input) => renderInput(input, intents)),
    ...form.inputs.map((input) => renderInput(input, intents)),
    element("div", { className: "inline-form__actions" }, [
      button(t("joint.form.cancel"), "button", intents.cancelConveyorForm),
      confirm,
    ]),
  ];
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": form.title } },
    parts.filter((part) => part !== null),
  );
}
