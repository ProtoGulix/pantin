import { IMPORT_FILE_ACCEPT } from "../import-options.ts";
import { type ImportFormView, UNIT_LABELS, UP_AXIS_LABELS } from "../view-model.ts";
import { button, element, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

export function renderImportButton(intents: PanelIntents, busy: boolean): HTMLElement {
  const fileInput = element("input", {
    className: "visually-hidden",
    attributes: { type: "file", accept: IMPORT_FILE_ACCEPT, "aria-label": "Mesh file to import" },
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      intents.chooseImportFile(file);
    }
    // Lets the user pick the same file again after a cancel.
    fileInput.value = "";
  });
  const trigger = button("Import mesh…", "button", () => fileInput.click());
  trigger.disabled = busy;
  return element("div", { className: "import-trigger" }, [trigger, fileInput]);
}

function field(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "field" }, [
    element("span", { className: "field__label", text: label }),
    control,
  ]);
}

function importActions(view: ImportFormView, intents: PanelIntents): HTMLElement {
  if (view.progressMessage !== null) {
    return element("div", { className: "import-progress", attributes: { role: "status" } }, [
      element("span", { className: "spinner" }),
      element("span", { text: view.progressMessage }),
    ]);
  }
  const confirm = button("Import", "button button--primary", intents.confirmImport);
  confirm.disabled = !view.canSubmit;
  return element("div", { className: "button-row" }, [
    button("Cancel", "button button--ghost", intents.cancelImport),
    confirm,
  ]);
}

export function renderImportForm(view: ImportFormView, intents: PanelIntents): HTMLElement {
  const locked = view.progressMessage !== null;
  const unitSelect = selectInput(UNIT_LABELS, view.unit, "Unit", intents.changeImportUnit);
  const upAxisSelect = selectInput(
    UP_AXIS_LABELS,
    view.upAxis,
    "Up axis",
    intents.changeImportUpAxis,
  );
  unitSelect.disabled = locked;
  upAxisSelect.disabled = locked;
  return element("div", { className: "import-form", attributes: { "aria-busy": String(locked) } }, [
    element("div", { className: "import-form__file" }, [
      element("span", { className: "import-form__name", text: view.fileName }),
      element("span", { className: "badge", text: view.formatLabel }),
    ]),
    view.showUnit ? field("Unit of the file", unitSelect) : null,
    field("Up axis in the file", upAxisSelect),
    importActions(view, intents),
  ]);
}
