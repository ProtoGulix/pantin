import { IMPORT_FILE_ACCEPT } from "../import-options.ts";
import type { PanelView } from "../view-model.ts";
import { renderContextMenu } from "./context-menu.ts";
import { element } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { renderImportForm } from "./import-form.ts";
import { renderJointForm } from "./joint-form.ts";
import { JointSliderControl } from "./joint-slider.ts";
import { renderMessageLine } from "./message-line.ts";
import { type PaneLayout, setUpPaneLayout } from "./pane-layout.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { createPantinList, type PantinList } from "./pantin-list.ts";
import { renderPromptLine } from "./prompt-line.ts";
import { renderPropertiesGrid } from "./properties-grid.ts";
import { renderCreatePantinForm, renderToolbar, type ToolbarCallbacks } from "./toolbar.ts";
import { createTreeView, type TreeView } from "./tree-view.ts";

// The left panel: quick-access bar, inline forms, then either the Pantin list
// (list view) or the tree and properties (edit view), a confirmation line and
// the message line. The skeleton is built once (so the tree and the list keep
// keyboard focus); each region is redrawn from the PanelView on every change.

export class SidePanel {
  private readonly panel: HTMLElement;
  private readonly toolbarHost = element("div", { className: "panel-header" });
  private readonly formHost = element("div", { className: "form-host" });
  private readonly treeView: TreeView = createTreeView();
  private readonly pantinList: PantinList = createPantinList();
  private readonly paneStack: HTMLElement;
  private readonly promptHost = element("div", { className: "prompt-host" });
  private readonly propertiesTitle = element("h2", { className: "pane__title" });
  private readonly jointSlider = new JointSliderControl();
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
  private hadPrompt = false;
  // Shared with the menu bar, whose Importer… opens the same file picker.
  readonly callbacks: ToolbarCallbacks = {
    openFilePicker: (targetPantinId) => {
      this.importTarget = targetPantinId;
      this.fileInput.click();
    },
  };

  constructor(panel: HTMLElement, layoutRoot: HTMLElement) {
    this.panel = panel;
    const treePane = element("section", { className: "pane pane--tree" }, [this.treeView.tree]);
    const propertiesPane = element("section", { className: "pane pane--properties" }, [
      this.propertiesTitle,
      this.jointSlider.element,
      this.propertiesBody,
    ]);
    const paneStack = element("div", { className: "pane-stack" }, [treePane, propertiesPane]);
    this.paneStack = paneStack;
    panel.replaceChildren(
      this.toolbarHost,
      this.formHost,
      this.pantinList.element,
      paneStack,
      this.promptHost,
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
    const openSelected = () => {
      const selected = view.listRows.find((row) => row.selected);
      if (selected !== undefined) {
        intents.openPantin(selected.id);
      }
    };
    this.toolbarHost.replaceChildren(renderToolbar(view, intents, this.callbacks, openSelected));
    this.renderForms(view, intents);
    this.renderViewContent(view, intents);
    this.renderPrompt(view, intents);
    const message = renderMessageLine(view.message, translate, intents);
    this.messageHost.replaceChildren(...(message === null ? [] : [message]));
    this.renderMenu(view, intents);
    this.fileInput.setAttribute("aria-label", translate("import.fileInputLabel"));
    this.layout.translateLabels(translate);
    restoreFocus(this.panel, focus);
  }

  // Only one of the two views is visible; the hidden one keeps its elements.
  private renderViewContent(view: PanelView, intents: PanelIntents): void {
    const { translate } = view;
    const listing = view.mode === "list";
    this.pantinList.element.hidden = !listing;
    this.paneStack.hidden = listing;
    this.pantinList.render(view.listRows, translate, intents);
    this.treeView.render(view.treeRows, view.language, translate, intents);
    this.propertiesTitle.textContent = translate("properties.label");
    this.jointSlider.render(view.jointSlider, translate, intents);
    this.propertiesBody.replaceChildren(renderPropertiesGrid(view.properties, translate, intents));
  }

  showJointPositions(positions: ReadonlyMap<string, number>): void {
    this.jointSlider.showPositions(positions);
  }

  private renderPrompt(view: PanelView, intents: PanelIntents): void {
    const prompt = renderPromptLine(view.prompt, intents);
    this.promptHost.replaceChildren(...(prompt === null ? [] : [prompt]));
    // A new question takes the keyboard, so Enter or Escape answer it at once.
    if (prompt !== null && !this.hadPrompt) {
      prompt.querySelector<HTMLButtonElement>(".button--primary")?.focus();
    }
    this.hadPrompt = prompt !== null;
  }

  private renderForms(view: PanelView, intents: PanelIntents): void {
    const { translate } = view;
    const createForm = view.toolbar.creatingPantin
      ? renderCreatePantinForm(translate, intents)
      : null;
    const importForm =
      view.importForm === null ? null : renderImportForm(view.importForm, translate, intents);
    const jointForm =
      view.jointForm === null ? null : renderJointForm(view.jointForm, translate, intents);
    this.formHost.replaceChildren(
      ...[createForm, importForm, jointForm].filter((form) => form !== null),
    );
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
