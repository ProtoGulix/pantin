import { IMPORT_FILE_ACCEPT } from "../import-options.ts";
import type { PanelView } from "../view-model.ts";
import { renderContextMenu } from "./context-menu.ts";
import { element } from "./dom.ts";
import { renderImportForm } from "./import-form.ts";
import { renderMessageLine } from "./message-line.ts";
import { type PaneLayout, setUpPaneLayout } from "./pane-layout.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";
import { renderCreatePantinForm, renderToolbar, type ToolbarCallbacks } from "./toolbar.ts";
import { createTreeView, type TreeView } from "./tree-view.ts";

// The left panel: toolbar, inline forms, tree, properties, message line. The
// skeleton is built once (so the tree keeps keyboard focus); each region is
// redrawn from the PanelView on every change.

interface FocusSnapshot {
  key: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  const key = active?.getAttribute("data-focus-key");
  if (!(active instanceof HTMLInputElement) || !root.contains(active) || !key) {
    return null;
  }
  const { value, selectionStart, selectionEnd } = active;
  return { key, value, selectionStart, selectionEnd };
}

// What the user was typing survives the rebuild of its region.
function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  const input = [...root.querySelectorAll("input")].find(
    (candidate) => candidate.getAttribute("data-focus-key") === snapshot?.key,
  );
  if (snapshot !== null && input !== undefined && document.activeElement !== input) {
    input.value = snapshot.value;
    input.focus();
    input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

export class SidePanel {
  private readonly panel: HTMLElement;
  private readonly toolbarHost = element("div", { className: "panel-header" });
  private readonly formHost = element("div", { className: "form-host" });
  private readonly treeView: TreeView = createTreeView();
  private readonly propertiesTitle = element("h2", { className: "pane__title" });
  private readonly propertiesBody = element("div", { className: "pane__body" });
  private readonly messageHost = element("div", { className: "message-host" });
  private readonly menuHost = element("div", { className: "menu-host" });
  private readonly fileInput = element("input", {
    className: "visually-hidden",
    attributes: { type: "file", accept: IMPORT_FILE_ACCEPT, tabindex: "-1" },
  });
  private readonly layout: PaneLayout;
  private intents: PanelIntents | null = null;
  private importTarget: string | null = null;
  // Focus moves into the create form or the menu only when they appear.
  private wasCreating = false;
  private previousMenuKey: string | null = null;
  private readonly callbacks: ToolbarCallbacks = {
    openFilePicker: (targetPantinId) => {
      this.importTarget = targetPantinId;
      this.fileInput.click();
    },
  };

  constructor(panel: HTMLElement, layoutRoot: HTMLElement) {
    this.panel = panel;
    const treePane = element("section", { className: "pane pane--tree" }, [this.treeView.element]);
    const propertiesPane = element("section", { className: "pane pane--properties" }, [
      this.propertiesTitle,
      this.propertiesBody,
    ]);
    const paneStack = element("div", { className: "pane-stack" }, [treePane, propertiesPane]);
    panel.replaceChildren(
      this.toolbarHost,
      this.formHost,
      paneStack,
      this.messageHost,
      this.menuHost,
      this.fileInput,
    );
    this.layout = setUpPaneLayout({ layoutRoot, panel, paneStack, treePane });
    this.fileInput.addEventListener("change", () => this.onFileChosen());
    document.addEventListener("pointerdown", (event) => this.closeMenuOnOutsidePointer(event));
  }

  render(view: PanelView, intents: PanelIntents): void {
    this.intents = intents;
    const focus = captureFocus(this.panel);
    const { translate } = view;
    this.toolbarHost.replaceChildren(renderToolbar(view, intents, this.callbacks));
    this.renderForms(view, intents);
    this.treeView.render(view.treeRows, view.language, translate, intents);
    this.propertiesTitle.textContent = translate("properties.label");
    this.propertiesBody.replaceChildren(renderPropertiesGrid(view.properties, translate, intents));
    const message = renderMessageLine(view.message, translate, intents);
    this.messageHost.replaceChildren(...(message === null ? [] : [message]));
    this.renderMenu(view, intents);
    this.fileInput.setAttribute("aria-label", translate("import.fileInputLabel"));
    this.layout.translateLabels(translate);
    restoreFocus(this.panel, focus);
  }

  private renderForms(view: PanelView, intents: PanelIntents): void {
    const { translate } = view;
    const createForm = view.toolbar.creatingPantin
      ? renderCreatePantinForm(translate, intents)
      : null;
    const importForm =
      view.importForm === null ? null : renderImportForm(view.importForm, translate, intents);
    this.formHost.replaceChildren(...[createForm, importForm].filter((form) => form !== null));
    if (createForm !== null && !this.wasCreating) {
      createForm.querySelector("input")?.focus();
    }
    this.wasCreating = createForm !== null;
  }

  private renderMenu(view: PanelView, intents: PanelIntents): void {
    const menu = view.contextMenu;
    const menuKey = menu === null ? null : `${menu.nodeId}@${menu.x},${menu.y}`;
    const isNew = menuKey !== this.previousMenuKey;
    this.menuHost.replaceChildren(
      ...(menu === null ? [] : [renderContextMenu(menu, intents, this.callbacks, isNew)]),
    );
    const menuJustClosed = menuKey === null && this.previousMenuKey !== null;
    if (menuJustClosed && document.activeElement === document.body) {
      // The menu closed with focus inside it: give focus back to the tree.
      this.treeView.tree.focus();
    }
    this.previousMenuKey = menuKey;
  }

  private onFileChosen(): void {
    const file = this.fileInput.files?.[0];
    if (file !== undefined) {
      this.intents?.chooseImportFile(file, this.importTarget);
    }
    // Lets the user pick the same file again after a cancel.
    this.fileInput.value = "";
  }

  private closeMenuOnOutsidePointer(event: PointerEvent): void {
    const target = event.target;
    const menuOpen = this.menuHost.childElementCount > 0;
    if (menuOpen && target instanceof Node && !this.menuHost.contains(target)) {
      this.intents?.closeContextMenu();
    }
  }
}
