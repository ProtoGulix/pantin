import type { BridgeStatus } from "@pantin/protocol";
import { type CentralLayout, showsIo, showsViewport } from "./central-layout.ts";
import type { ClientConsole } from "./console/console-list.ts";
import { buildConsoleView, type ConsoleView } from "./console/console-view.ts";
import { type DeviceRef, deviceName, relatedJointIds } from "./device-selection.ts";
import {
  buildExternalEditBanner,
  type ExternalEditBannerView,
} from "./external-edits/external-edit-model.ts";
import { createTranslator, type Language, type Translate } from "./i18n/translate.ts";
import { buildInspectorView, type InspectorView } from "./inspector/inspector-model.ts";
import { buildIoView, type IoView } from "./io/io-view-model.ts";
import { buildSymbolImportView, type SymbolImportView } from "./io/symbol-import-view.ts";
import { buildMenuBar, type MenuView } from "./menu/menu-model.ts";
import type { MessageLevel } from "./messages.ts";
import { type AboutView, buildAboutView } from "./panel/about-model.ts";
import { buildContextMenuView, type ContextMenuView } from "./panel/context-menu-model.ts";
import { buildImportFormView, type ImportFormView } from "./panel/import-form-model.ts";
import { buildPromptView, type PromptView } from "./panel/prompt-model.ts";
import { buildWelcomeView, type WelcomeView } from "./panel/welcome-model.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "./selection.ts";
import { type ViewMode, viewModeOf } from "./session-state.ts";
import { NO_TAG_VALUES, type TagValues } from "./tree/device-state.ts";
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
  // Shows a "Retry" button for the meshes which failed to load.
  retryMeshLoad: boolean;
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
  // The About window of the Help menu (ADR 0058).
  about: AboutView;
  // The PLC symbol import dialog (ADR 0064 point 14).
  symbolImport: SymbolImportView;
  // Edit view only.
  treeRows: TreeRow[];
  importForm: ImportFormView | null;
  contextMenu: ContextMenuView | null;
  prompt: PromptView | null;
  // The warning above the central area while a file changed outside Pantin (ADR 0063).
  externalEdit: ExternalEditBannerView | null;
  message: MessageView | null;
  viewportHint: string;
  // The right-hand panel: the only properties panel (ADR 0030).
  inspector: InspectorView;
  // The Pantin console and its counter (ADR 0031); null with no Pantin open.
  console: ConsoleView | null;
  // The I/O view (ADR 0049 point 11); null unless it is the central layout.
  io: IoView | null;
}

// A file modified outside Pantin can be overwritten by a save even with no unsaved edit (ADR 0063 point 4).
function hasSomethingToSave(state: ViewerState): boolean {
  const open = state.openPantin;
  return open !== null && (open.unsavedChanges || open.changedOutside.length > 0);
}

function buildToolbarView(state: ViewerState): ToolbarView {
  const busy = state.pendingRequestCount > 0;
  const hasBodies = (state.openPantin?.document.bodies.length ?? 0) > 0;
  const viewportShown = showsViewport(state.centralLayout);
  return {
    mode: viewModeOf(state),
    busy,
    saveEnabled: hasSomethingToSave(state) && !busy,
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
    retryMeshLoad: message.retryMeshLoad,
  };
}

function relatedJointsOf(state: ViewerState): ReadonlySet<string> {
  const document = state.openPantin?.document;
  const device = selectedDeviceOf(state.selection);
  return document === undefined || device === null ? new Set() : relatedJointIds(document, device);
}

function buildIo(state: ViewerState, bridgeStatuses: readonly BridgeStatus[]): IoView | null {
  const document = state.openPantin?.document;
  if (document === undefined || !showsIo(state.centralLayout)) {
    return null;
  }
  const names = new Map(document.assemblies.map((assembly) => [assembly.key, assembly.name]));
  return buildIoView(
    state.io,
    names,
    state.language,
    state.pendingRequestCount > 0,
    bridgeStatuses,
  );
}

export function buildPanelView(
  state: ViewerState,
  consoleList: ClientConsole,
  clockRunning: boolean,
  tagValues: TagValues = NO_TAG_VALUES,
  bridgeStatuses: readonly BridgeStatus[] = [],
): PanelView {
  const translate = createTranslator(state.language);
  const mode = viewModeOf(state);
  return {
    translate,
    language: state.language,
    mode,
    menus: buildMenuBar(state, translate),
    toolbar: buildToolbarView(state),
    welcome: buildWelcomeView(state, translate),
    about: buildAboutView(state.about, state.language, translate),
    symbolImport: buildSymbolImportView(state.symbolImport, translate),
    treeRows: flattenTree(
      buildTree({ ...state, tagValues }, translate),
      state,
      relatedJointsOf(state),
    ),
    importForm: buildImportFormView(state, translate),
    contextMenu: buildContextMenuView(state, translate),
    prompt: buildPromptView(state, translate),
    externalEdit: buildExternalEditBanner(state.openPantin, translate),
    message: buildMessageView(state, translate),
    viewportHint: translate(
      mode === "list" ? "page.viewportEmpty" : `page.viewportHint.${state.navigation.preset}`,
    ),
    inspector: buildInspectorView(state, translate, clockRunning, bridgeStatuses),
    console: buildConsoleView(
      state.console,
      consoleList,
      state.openPantin,
      state.language,
      translate,
    ),
    io: buildIo(state, bridgeStatuses),
  };
}
