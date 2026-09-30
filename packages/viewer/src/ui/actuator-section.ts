import type { Translate } from "../i18n/translate.ts";
import type {
  ActuatorCardView,
  ActuatorFormView,
  ActuatorSectionView,
} from "../panel/actuator-panel-model.ts";
import { button, element, selectInput } from "./dom.ts";
import { checkbox, field, formInput, valueSpan } from "./panel-fields.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The actuators section of the right-hand panel (ADR 0028 point 13): which
// drive feeds an actuator and through which ports, and the joints it moves.
// Joint positions are written in place by the panel's showTagValues.

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
    ? element("p", { className: "drive-panel__empty", text: t("actuators.form.noFittingDrive") })
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

function renderParameters(form: ActuatorFormView, intents: PanelIntents) {
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

function renderForm(form: ActuatorFormView, t: Translate, intents: PanelIntents): HTMLElement {
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
    ...renderParameters(form, intents),
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
function renderFeed(card: ActuatorCardView, t: Translate): HTMLElement[] {
  if (card.feed === null) {
    return [element("div", { className: "drive-panel__detail", text: t("actuators.noFeed") })];
  }
  return [
    element("div", { className: "drive-panel__label", text: t("actuators.feed") }),
    element("div", { className: "drive-panel__row" }, [
      element("strong", { text: card.feed.driveName }),
    ]),
    ...card.feed.pairs.map((pair) =>
      element("div", { className: "drive-panel__row" }, [
        element("span", { text: pair.input }),
        element("span", { className: "drive-panel__detail", text: pair.output }),
      ]),
    ),
  ];
}

function renderCard(card: ActuatorCardView, t: Translate, intents: PanelIntents): HTMLElement {
  const joints = card.joints.map((joint) =>
    element("div", { className: "drive-panel__row", attributes: { title: joint.positionTag } }, [
      element("span", { text: joint.unit === null ? joint.name : `${joint.name} (${joint.unit})` }),
      valueSpan(joint.positionTag, joint.coordinateUnit),
      checkbox(t("drives.fault.jammed"), joint.jammed, (on) =>
        intents.setJointJammed(joint.id, on),
      ),
    ]),
  );
  return element(
    "section",
    { className: "drive-panel__card", attributes: { "aria-label": card.name } },
    [
      element("div", { className: "drive-panel__card-head" }, [
        element("strong", { text: card.name }),
        element("span", { className: "drive-panel__detail", text: card.typeLabel }),
      ]),
      element("div", { className: "drive-panel__actions" }, [
        button(t("drives.edit"), "button", () => intents.openActuatorForm(card.id)),
        button(t("drives.delete"), "button", () => intents.deleteActuator(card.id)),
      ]),
      ...renderFeed(card, t),
      element("div", { className: "drive-panel__label", text: t("actuators.joints") }),
      ...joints,
    ],
  );
}

export function renderActuatorSection(
  view: ActuatorSectionView,
  t: Translate,
  intents: PanelIntents,
): HTMLElement {
  const create = button(t("actuators.new"), "button", () => intents.openActuatorForm(null));
  create.disabled = !view.canCreate;
  const empty = view.canCreate ? t("actuators.empty") : t("actuators.noMovableJoint");
  return element(
    "section",
    { className: "drive-panel__section", attributes: { "aria-label": view.title } },
    [
      element("div", { className: "drive-panel__head" }, [
        element("h3", { className: "drive-panel__title", text: view.title }),
        create,
      ]),
      view.form === null ? null : renderForm(view.form, t, intents),
      view.actuators.length === 0
        ? element("p", { className: "drive-panel__empty", text: empty })
        : null,
      ...view.actuators.map((card) => renderCard(card, t, intents)),
    ].filter((part) => part !== null),
  );
}
