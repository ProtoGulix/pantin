import type { Translate } from "../i18n/translate.ts";
import type { PanelView } from "../view-model.ts";
import { committingTextInput, element, iconButton, selectInput } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Compact icon toolbar at the top of the panel, and the inline "new Pantin"
// form it opens. No menu bar: every action is one click or a context menu.

export interface ToolbarCallbacks {
  // Opens the browser's file picker; must run inside the click (user gesture).
  openFilePicker(targetPantinId: string | null): void;
}

function saveButton(view: PanelView, intents: PanelIntents): HTMLElement {
  const { toolbar, translate } = view;
  const label = translate(toolbar.hasUnsavedChanges ? "toolbar.saveUnsaved" : "toolbar.save");
  const save = iconButton("save", label, intents.savePantin, !toolbar.saveEnabled);
  if (toolbar.hasUnsavedChanges) {
    save.append(element("span", { className: "unsaved-dot" }));
  }
  return save;
}

function languageSelect(view: PanelView, intents: PanelIntents): HTMLElement {
  const select = selectInput(
    view.languageOptions,
    view.language,
    view.translate("language.label"),
    intents.changeLanguage,
  );
  select.classList.add("select-input--compact");
  return select;
}

function busyIndicator(view: PanelView): HTMLElement | null {
  if (!view.toolbar.busy) {
    return null;
  }
  const label = view.translate("toolbar.busy");
  return element("span", {
    className: "spinner",
    attributes: { role: "status", "aria-label": label, title: label },
  });
}

function actionButtons(
  view: PanelView,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
): HTMLElement[] {
  const { toolbar, translate } = view;
  const create = iconButton("plus", translate("toolbar.newPantin"), intents.toggleCreatePantin);
  create.setAttribute("aria-pressed", String(toolbar.creatingPantin));
  const openPicker = () => callbacks.openFilePicker(null);
  return [
    create,
    saveButton(view, intents),
    iconButton("import", translate("toolbar.import"), openPicker, !toolbar.importEnabled),
    element("span", { className: "toolbar__separator", attributes: { role: "separator" } }),
    iconButton(
      "frame-all",
      translate("toolbar.frameAll"),
      intents.frameAll,
      !toolbar.frameAllEnabled,
    ),
    iconButton(
      "frame-selection",
      translate("toolbar.frameSelection"),
      intents.frameSelection,
      !toolbar.frameSelectionEnabled,
    ),
  ];
}

export function renderToolbar(
  view: PanelView,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  return element(
    "div",
    {
      className: "toolbar",
      attributes: { role: "toolbar", "aria-label": view.translate("toolbar.label") },
    },
    [
      ...actionButtons(view, intents, callbacks),
      element("span", { className: "toolbar__spacer" }),
      busyIndicator(view),
      languageSelect(view, intents),
    ],
  );
}

export function renderCreatePantinForm(translate: Translate, intents: PanelIntents): HTMLElement {
  const input = committingTextInput("", {
    label: translate("create.label"),
    focusKey: "create-pantin",
    onCommit: (name) => intents.createPantin(name),
    onCancel: () => intents.toggleCreatePantin(),
    commitOnBlur: false,
  });
  input.placeholder = translate("create.label");
  return element(
    "div",
    {
      className: "inline-form inline-form--row",
      attributes: { role: "group", "aria-label": translate("toolbar.newPantin") },
    },
    [
      input,
      iconButton("check", translate("create.confirm"), () => intents.createPantin(input.value)),
      iconButton("close", translate("create.cancel"), intents.toggleCreatePantin),
    ],
  );
}
