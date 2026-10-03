import type { CentralLayout } from "../central-layout.ts";
import type { PanelView } from "../view-model.ts";
import { createConsoleCounter } from "./console-counter.ts";
import { element, iconButton } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Compact quick-access bar under the menu bar, with the buttons of the edit
// view (the welcome dialog has its own controls).

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

// "3D / Schéma / 3D + Schéma": three toggle buttons, exactly one pressed
// (ADR 0030 point 7).
function viewSwitch(view: PanelView, intents: PanelIntents): HTMLElement {
  const { translate, toolbar } = view;
  const choice = (layout: CentralLayout, text: string, title: string) => {
    const pressed = toolbar.centralLayout === layout;
    const created = element("button", {
      className: `view-switch__button${pressed ? " is-pressed" : ""}`,
      text,
      attributes: { type: "button", title, "aria-pressed": String(pressed) },
    });
    created.addEventListener("click", () => intents.setCentralLayout(layout));
    return created;
  };
  return element(
    "div",
    {
      className: "view-switch",
      attributes: { role: "group", "aria-label": translate("toolbar.viewSwitch") },
    },
    [
      choice("3d", translate("toolbar.view3d"), translate("menubar.view.layout3d")),
      choice("diagram", translate("toolbar.viewDiagram"), translate("menubar.view.layoutDiagram")),
      choice("both", translate("toolbar.viewBoth"), translate("menubar.view.layoutBoth")),
    ],
  );
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

// Edit view: back to the welcome dialog, save, import, framing.
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
    element("span", { className: "toolbar__separator", attributes: { role: "separator" } }),
    viewSwitch(view, intents),
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
      ...editButtons(view, intents, callbacks),
      element("span", { className: "toolbar__spacer" }),
      view.console === null ? null : createConsoleCounter(view.console, intents.toggleConsole),
      busyIndicator(view),
    ],
  );
}
