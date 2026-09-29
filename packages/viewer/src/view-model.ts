import { createTranslator, type Language, pluralKey, type Translate } from "./i18n/translate.ts";
import { buildMenuBar, type MenuView } from "./menu/menu-model.ts";
import type { MessageLevel } from "./messages.ts";
import { buildContextMenuView, type ContextMenuView } from "./panel/context-menu-model.ts";
import { buildImportFormView, type ImportFormView } from "./panel/import-form-model.ts";
import { buildPromptView, type PromptView } from "./panel/prompt-model.ts";
import { buildPropertyGroups, type PropertyGroup } from "./properties/properties-model.ts";
import { type ViewMode, viewModeOf } from "./session-state.ts";
import { buildTree, flattenTree, type TreeRow } from "./tree/tree-model.ts";
import type { ViewerState } from "./viewer-state.ts";

// Display logic: turns ViewerState into exactly what the window shows, as
// plain data. No DOM here, so every rule is unit tested under Node.

interface ToolbarView {
  mode: ViewMode;
  busy: boolean;
  creatingPantin: boolean;
  openEnabled: boolean;
  saveEnabled: boolean;
  hasUnsavedChanges: boolean;
  importEnabled: boolean;
  frameAllEnabled: boolean;
  frameSelectionEnabled: boolean;
}

export interface PantinListRowView {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
}

export interface MessageView {
  level: MessageLevel;
  levelLabel: string;
  text: string;
  detail: string | null;
}

export interface PanelView {
  // For the fixed labels of components (column headers, tooltips).
  translate: Translate;
  language: Language;
  mode: ViewMode;
  menus: MenuView[];
  toolbar: ToolbarView;
  // List view only.
  listRows: PantinListRowView[];
  // Edit view only.
  treeRows: TreeRow[];
  properties: PropertyGroup[];
  importForm: ImportFormView | null;
  contextMenu: ContextMenuView | null;
  prompt: PromptView | null;
  message: MessageView | null;
  viewportHint: string;
}

function buildToolbarView(state: ViewerState): ToolbarView {
  const busy = state.pendingRequestCount > 0;
  const hasBodies = (state.openPantin?.document.bodies.length ?? 0) > 0;
  return {
    mode: viewModeOf(state),
    busy,
    creatingPantin: state.creatingPantin,
    openEnabled: state.listSelectedPantinId !== null && !busy,
    saveEnabled: (state.openPantin?.unsavedChanges ?? false) && !busy,
    hasUnsavedChanges: state.openPantin?.unsavedChanges ?? false,
    importEnabled: state.openPantin !== null && !busy && !state.importInProgress,
    frameAllEnabled: hasBodies,
    frameSelectionEnabled: hasBodies && state.selectedNodeId !== null,
  };
}

function buildListRows(state: ViewerState, t: Translate): PantinListRowView[] {
  if (viewModeOf(state) !== "list") {
    return [];
  }
  return state.pantins.map((summary) => ({
    id: summary.id,
    name: summary.name,
    detail: t("list.rowDetail", {
      id: summary.id,
      bodyCount: t(pluralKey("tree.bodyCount", summary.bodyCount), { count: summary.bodyCount }),
    }),
    selected: summary.id === state.listSelectedPantinId,
  }));
}

function buildMessageView(state: ViewerState, t: Translate): MessageView | null {
  const message = state.message;
  if (message === null) {
    return null;
  }
  return {
    level: message.level,
    levelLabel: t(`message.level.${message.level}`),
    text: t(message.key, message.parameters),
    detail: message.detail,
  };
}

export function buildPanelView(state: ViewerState): PanelView {
  const translate = createTranslator(state.language);
  const mode = viewModeOf(state);
  return {
    translate,
    language: state.language,
    mode,
    menus: buildMenuBar(state, translate),
    toolbar: buildToolbarView(state),
    listRows: buildListRows(state, translate),
    treeRows: flattenTree(buildTree(state, translate), state),
    properties: buildPropertyGroups(
      state,
      state.selectedNodeId,
      state.collapsedPropertyGroups,
      translate,
    ),
    importForm: buildImportFormView(state, translate),
    contextMenu: buildContextMenuView(state, translate),
    prompt: buildPromptView(state, translate),
    message: buildMessageView(state, translate),
    viewportHint: translate(mode === "list" ? "page.viewportEmpty" : "page.viewportHint"),
  };
}
