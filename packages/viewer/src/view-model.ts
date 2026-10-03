import { type AlignmentView, buildAlignmentView } from "./alignment/alignment-view.ts";
import { type CentralLayout, showsViewport } from "./central-layout.ts";
import type { ClientConsole } from "./console/console-list.ts";
import { buildConsoleView, type ConsoleView } from "./console/console-view.ts";
import { type DeviceRef, deviceName, relatedJointIds } from "./device-selection.ts";
import { createTranslator, type Language, type Translate } from "./i18n/translate.ts";
import { buildInspectorView, type InspectorView } from "./inspector/inspector-model.ts";
import { buildMenuBar, type MenuView } from "./menu/menu-model.ts";
import type { MessageLevel } from "./messages.ts";
import { buildContextMenuView, type ContextMenuView } from "./panel/context-menu-model.ts";
import { buildImportFormView, type ImportFormView } from "./panel/import-form-model.ts";
import { buildPromptView, type PromptView } from "./panel/prompt-model.ts";
import { buildWelcomeView, type WelcomeView } from "./panel/welcome-model.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "./selection.ts";
import { type ViewMode, viewModeOf } from "./session-state.ts";
import { buildTree } from "./tree/tree-model.ts";
import { flattenTree, type TreeRow } from "./tree/tree-rows.ts";
import type { ViewerState } from "./viewer-state.ts";

// Display logic: turns ViewerState into exactly what the window shows, as
// plain data. No DOM here, so every rule is unit tested under Node.

interface ToolbarView {
  mode: ViewMode;
  busy: boolean;
  saveEnabled: boolean;
  hasUnsavedChanges: boolean;
  importEnabled: boolean;
  frameAllEnabled: boolean;
  frameSelectionEnabled: boolean;
  // What the central area shows: 3D, the chain diagram, or both (ADR 0030).
  centralLayout: CentralLayout;
}

export interface MessageView {
  level: MessageLevel;
  levelLabel: string;
  text: string;
  detail: string | null;
  // Devices the message names, in the order it gives them.
  links: MessageLinkView[];
}

export interface MessageLinkView {
  label: string;
  device: DeviceRef;
}

export interface PanelView {
  // For the fixed labels of components (column headers, tooltips).
  translate: Translate;
  language: Language;
  mode: ViewMode;
  menus: MenuView[];
  toolbar: ToolbarView;
  // List view only: the welcome dialog (ADR 0027).
  welcome: WelcomeView;
  // Edit view only.
  treeRows: TreeRow[];
  importForm: ImportFormView | null;
  contextMenu: ContextMenuView | null;
  prompt: PromptView | null;
  message: MessageView | null;
  viewportHint: string;
  // The right-hand panel: the only properties panel (ADR 0030).
  inspector: InspectorView;
  // The Pantin console and its counter (ADR 0031); null with no Pantin open.
  console: ConsoleView | null;
  // The alignment panel (ADR 0035), or null when no alignment is under way.
  alignment: AlignmentView | null;
}

function buildToolbarView(state: ViewerState): ToolbarView {
  const busy = state.pendingRequestCount > 0;
  const hasBodies = (state.openPantin?.document.bodies.length ?? 0) > 0;
  const viewportShown = showsViewport(state.centralLayout);
  return {
    mode: viewModeOf(state),
    busy,
    saveEnabled: (state.openPantin?.unsavedChanges ?? false) && !busy,
    hasUnsavedChanges: state.openPantin?.unsavedChanges ?? false,
    importEnabled: state.openPantin !== null && !busy && !state.importInProgress,
    // Framing moves the 3D camera, which the diagram alone hides.
    frameAllEnabled: hasBodies && viewportShown,
    frameSelectionEnabled: hasBodies && selectedNodeIdOf(state.selection) !== null && viewportShown,
    centralLayout: state.centralLayout,
  };
}

// A device the document no longer has gets no link: there is nothing to select.
function messageLinks(state: ViewerState, devices: readonly DeviceRef[]): MessageLinkView[] {
  const document = state.openPantin?.document;
  return devices.flatMap((device) => {
    const label = document === undefined ? null : deviceName(document, device);
    return label === null ? [] : [{ label, device }];
  });
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
    links: messageLinks(state, message.links),
  };
}

function relatedJointsOf(state: ViewerState): ReadonlySet<string> {
  const document = state.openPantin?.document;
  const device = selectedDeviceOf(state.selection);
  return document === undefined || device === null ? new Set() : relatedJointIds(document, device);
}

export function buildPanelView(state: ViewerState, consoleList: ClientConsole): PanelView {
  const translate = createTranslator(state.language);
  const mode = viewModeOf(state);
  return {
    translate,
    language: state.language,
    mode,
    menus: buildMenuBar(state, translate),
    toolbar: buildToolbarView(state),
    welcome: buildWelcomeView(state, translate),
    treeRows: flattenTree(buildTree(state, translate), state, relatedJointsOf(state)),
    importForm: buildImportFormView(state, translate),
    contextMenu: buildContextMenuView(state, translate),
    prompt: buildPromptView(state, translate),
    message: buildMessageView(state, translate),
    viewportHint: translate(
      mode === "list" ? "page.viewportEmpty" : `page.viewportHint.${state.navigation.preset}`,
    ),
    inspector: buildInspectorView(state, translate),
    console: buildConsoleView(
      state.console,
      consoleList,
      state.openPantin,
      state.language,
      translate,
    ),
    alignment: buildAlignmentView(state, translate),
  };
}
