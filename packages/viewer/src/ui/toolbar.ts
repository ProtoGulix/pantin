import type { Translate } from "../i18n/translate.ts";
import type { PanelView } from "../view-model.ts";
import { committingTextInput, element, iconButton } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Compact quick-access bar under the menu bar, with the buttons of the
// current view, and the inline "new Pantin" form it opens.

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

// List view: create a Pantin, open the selected one.
function listButtons(
  view: PanelView,
  intents: PanelIntents,
  openSelected: () => void,
): HTMLElement[] {
  const { toolbar, translate } = view;
  const create = iconButton("plus", translate("toolbar.newPantin"), intents.toggleCreatePantin);
  create.setAttribute("aria-pressed", String(toolbar.creatingPantin));
  return [
    create,
    iconButton("open", translate("toolbar.open"), openSelected, !toolbar.openEnabled),
  ];
}

// Edit view: back to the list, save, import, framing.
function editButtons(
  view: PanelView,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
): HTMLElement[] {
  const { toolbar, translate } = view;
  const openPicker = () => callbacks.openFilePicker(null);
  return [
    iconButton("back", translate("toolbar.close"), intents.requestClose),
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
  openSelected: () => void,
): HTMLElement {
  const buttons =
    view.mode === "list"
      ? listButtons(view, intents, openSelected)
      : editButtons(view, intents, callbacks);
  return element(
    "div",
    {
      className: "toolbar",
      attributes: { role: "toolbar", "aria-label": view.translate("toolbar.label") },
    },
    [...buttons, element("span", { className: "toolbar__spacer" }), busyIndicator(view)],
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
