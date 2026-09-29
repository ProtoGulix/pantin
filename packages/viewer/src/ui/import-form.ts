import type { Translate } from "../i18n/translate.ts";
import type { ImportFormView } from "../panel/import-form-model.ts";
import { button, element, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Compact inline form under the toolbar: file, format-dependent options, and
// either the buttons or the progress line while the core works.

function field(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "inline-field" }, [
    element("span", { className: "inline-field__label", text: label }),
    control,
  ]);
}

function actions(view: ImportFormView, translate: Translate, intents: PanelIntents): HTMLElement {
  if (view.progressMessage !== null) {
    return element("div", { className: "inline-form__progress", attributes: { role: "status" } }, [
      element("span", { className: "spinner" }),
      element("span", { text: view.progressMessage }),
    ]);
  }
  const confirm = button(
    translate("import.confirm"),
    "button button--primary",
    intents.confirmImport,
  );
  confirm.disabled = !view.canSubmit;
  return element("div", { className: "inline-form__actions" }, [
    button(translate("import.cancel"), "button", intents.cancelImport),
    confirm,
  ]);
}

function optionList(options: Readonly<Record<string, string>>) {
  return Object.entries(options).map(([value, label]) => ({ value, label }));
}

function optionSelects(view: ImportFormView, translate: Translate, intents: PanelIntents) {
  const locked = view.progressMessage !== null;
  const unit = selectInput(
    optionList(view.unitOptions),
    view.unit,
    translate("import.unit"),
    intents.changeImportUnit,
  );
  const upAxis = selectInput(
    optionList(view.upAxisOptions),
    view.upAxis,
    translate("import.upAxis"),
    intents.changeImportUpAxis,
  );
  // Options cannot change while the core is working on the file.
  unit.disabled = locked;
  upAxis.disabled = locked;
  return { unit, upAxis };
}

function fileLine(view: ImportFormView): HTMLElement {
  return element("div", { className: "inline-form__file" }, [
    element("span", {
      className: "inline-form__file-name",
      text: view.fileName,
      attributes: { title: view.fileName },
    }),
    element("span", { className: "badge", text: view.formatLabel }),
  ]);
}

export function renderImportForm(
  view: ImportFormView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const { unit, upAxis } = optionSelects(view, translate, intents);
  const busy = String(view.progressMessage !== null);
  return element(
    "div",
    {
      className: "inline-form",
      attributes: { role: "group", "aria-label": view.title, "aria-busy": busy },
    },
    [
      element("div", { className: "inline-form__title", text: view.title }),
      fileLine(view),
      view.showUnit ? field(translate("import.unit"), unit) : null,
      field(translate("import.upAxis"), upAxis),
      actions(view, translate, intents),
    ],
  );
}
