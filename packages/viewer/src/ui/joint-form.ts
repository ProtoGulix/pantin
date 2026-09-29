import type { Translate } from "../i18n/translate.ts";
import type {
  JointFormAxisView,
  JointFormRowView,
  JointFormView,
} from "../panel/joint-form-model.ts";
import { button, element, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The inline "New joint" form under the toolbar. Every text input reports
// each edit to the controller (which keeps it without redrawing), so a redraw
// of the panel never loses what was typed.

function field(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "inline-field" }, [
    element("span", { className: "inline-field__label", text: label }),
    control,
  ]);
}

function listenToKeys(input: HTMLInputElement, intents: PanelIntents): void {
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      intents.submitJointForm();
    } else if (event.key === "Escape") {
      intents.cancelJointForm();
    }
  });
}

function textInput(
  id: string,
  value: string,
  label: string,
  numeric: boolean,
  intents: PanelIntents,
): HTMLInputElement {
  const input = element("input", {
    className: numeric ? "text-input text-input--number" : "text-input",
    attributes: {
      type: "text",
      "aria-label": label,
      "data-focus-key": `joint-${id}`,
      spellcheck: "false",
      ...(numeric ? { inputmode: "decimal" } : {}),
    },
  });
  input.value = value;
  input.addEventListener("input", () => intents.editJointField(id, input.value));
  listenToKeys(input, intents);
  return input;
}

function numberRow(row: JointFormRowView, intents: PanelIntents): HTMLElement {
  const inputs = row.inputs.map((input) =>
    textInput(input.id, input.value, input.ariaLabel, true, intents),
  );
  const unit =
    row.unit === null ? null : element("span", { className: "joint-form__unit", text: row.unit });
  return field(row.label, element("span", { className: "joint-form__inputs" }, [...inputs, unit]));
}

// X, Y, Z or custom as radio buttons, the sense as a checkbox: a click
// redraws the form, which reveals the components of a custom direction.
function axisDirectionField(axis: JointFormAxisView, intents: PanelIntents): HTMLElement {
  const radios = axis.options.map((option) => {
    const radio = element("input", {
      className: "choice__input",
      attributes: { type: "radio", name: "joint-axis-direction", value: option.value },
    });
    radio.checked = option.value === axis.choice.direction;
    radio.addEventListener("change", () => intents.chooseJointAxis(option.value));
    return element("label", { className: "choice" }, [
      radio,
      element("span", { text: option.label }),
    ]);
  });
  return element("div", { className: "inline-field" }, [
    element("span", { className: "inline-field__label", text: axis.label }),
    element(
      "div",
      { className: "choice-group", attributes: { role: "radiogroup", "aria-label": axis.label } },
      radios,
    ),
  ]);
}

function reversedField(
  reversed: NonNullable<JointFormAxisView["reversed"]>,
  intents: PanelIntents,
): HTMLElement {
  const checkbox = element("input", {
    className: "choice__input",
    attributes: { type: "checkbox" },
  });
  checkbox.checked = reversed.checked;
  checkbox.addEventListener("change", intents.reverseJointAxis);
  return element("div", { className: "inline-field" }, [
    element("span"),
    element("label", { className: "choice" }, [
      checkbox,
      element("span", { text: reversed.label }),
    ]),
  ]);
}

function axisFields(axis: JointFormAxisView, intents: PanelIntents): HTMLElement[] {
  return [
    axisDirectionField(axis, intents),
    ...(axis.components === null ? [] : [numberRow(axis.components, intents)]),
    ...(axis.reversed === null ? [] : [reversedField(axis.reversed, intents)]),
    element("p", { className: "inline-form__hint", text: axis.hint }),
  ];
}

// The swatch repeats the colour the body takes in the 3D view.
function bodyField(label: string, role: "parent" | "child", control: HTMLElement): HTMLElement {
  return element("label", { className: "inline-field" }, [
    element("span", { className: "inline-field__label" }, [
      element("span", { className: `body-swatch body-swatch--${role}` }),
      element("span", { text: label }),
    ]),
    control,
  ]);
}

export function renderJointForm(
  view: JointFormView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const type = selectInput(
    view.typeOptions,
    view.type,
    translate("joint.form.type"),
    intents.changeJointType,
  );
  const parent = selectInput(view.bodyOptions, view.parent, translate("joint.form.parent"), (id) =>
    intents.editJointField(view.parentFieldId, id),
  );
  const child = selectInput(view.bodyOptions, view.child, translate("joint.form.child"), (id) =>
    intents.editJointField(view.childFieldId, id),
  );
  const create = button(view.confirmLabel, "button button--primary", intents.submitJointForm);
  create.disabled = !view.canSubmit;
  return element(
    "div",
    { className: "inline-form", attributes: { role: "group", "aria-label": view.title } },
    [
      element("div", { className: "inline-form__title", text: view.title }),
      field(translate("joint.form.type"), type),
      field(
        translate("joint.form.name"),
        textInput(view.nameFieldId, view.name, translate("joint.form.name"), false, intents),
      ),
      bodyField(translate("joint.form.parent"), "parent", parent),
      bodyField(translate("joint.form.child"), "child", child),
      ...axisFields(view.axis, intents),
      numberRow(view.origin, intents),
      ...view.rows.map((row) => numberRow(row, intents)),
      element("div", { className: "inline-form__actions" }, [
        button(translate("joint.form.cancel"), "button", intents.cancelJointForm),
        create,
      ]),
    ],
  );
}
