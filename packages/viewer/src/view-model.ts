import { deviceName, relatedJointIds } from "./device-selection.ts";
import { createTranslator, type Language, type Translate } from "./i18n/translate.ts";
import { buildInspectorView, type InspectorView } from "./inspector/inspector-model.ts";
import { buildJointSlider, type JointSliderSpec } from "./joints/slider-model.ts";
import { buildMenuBar, type MenuView } from "./menu/menu-model.ts";
import type { MessageLevel } from "./messages.ts";
import { buildContextMenuView, type ContextMenuView } from "./panel/context-menu-model.ts";
import { buildImportFormView, type ImportFormView } from "./panel/import-form-model.ts";
import { buildJointFormView, type JointFormView } from "./panel/joint-form-model.ts";
import { buildPromptView, type PromptView } from "./panel/prompt-model.ts";
import { buildWelcomeView, type WelcomeView } from "./panel/welcome-model.ts";
import { buildPropertyGroups } from "./properties/properties-model.ts";
import type { PropertyGroup } from "./properties/property-rows.ts";
import { type ViewMode, viewModeOf } from "./session-state.ts";
import { parseNodeId } from "./tree/node-ids.ts";
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
  // The chain diagram replaces the 3D view (ADR 0029).
  diagramShown: boolean;
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
  // List view only: the welcome dialog (ADR 0027).
  welcome: WelcomeView;
  // Edit view only.
  treeRows: TreeRow[];
  properties: PropertyGroup[];
  importForm: ImportFormView | null;
  jointForm: JointFormView | null;
  // The slider of the selected joint, when it can move.
  jointSlider: JointSliderSpec | null;
  contextMenu: ContextMenuView | null;
  prompt: PromptView | null;
  message: MessageView | null;
  viewportHint: string;
  // Left-hand panel while a device is selected: a line instead of the grid.
  propertiesNote: string | null;
  // The right-hand panel: the inspector of the selection (ADR 0030).
  inspector: InspectorView;
}

function buildToolbarView(state: ViewerState): ToolbarView {
  const busy = state.pendingRequestCount > 0;
  const hasBodies = (state.openPantin?.document.bodies.length ?? 0) > 0;
  return {
    mode: viewModeOf(state),
    busy,
    saveEnabled: (state.openPantin?.unsavedChanges ?? false) && !busy,
    hasUnsavedChanges: state.openPantin?.unsavedChanges ?? false,
    importEnabled: state.openPantin !== null && !busy && !state.importInProgress,
    // Framing moves the 3D camera, which the diagram hides.
    frameAllEnabled: hasBodies && !state.diagramShown,
    frameSelectionEnabled: hasBodies && state.selectedNodeId !== null && !state.diagramShown,
    diagramShown: state.diagramShown,
  };
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

function selectedJointSlider(state: ViewerState): JointSliderSpec | null {
  const ref = state.selectedNodeId === null ? null : parseNodeId(state.selectedNodeId);
  if (ref?.kind !== "joint") {
    return null;
  }
  const pantin = state.openPantin;
  const joint = pantin?.document.joints.find((candidate) => candidate.id === ref.jointId);
  return pantin === null || pantin === undefined || joint === undefined
    ? null
    : buildJointSlider(pantin.id, joint);
}

function relatedJointsOf(state: ViewerState): ReadonlySet<string> {
  const document = state.openPantin?.document;
  return document === undefined || state.selectedDevice === null
    ? new Set()
    : relatedJointIds(document, state.selectedDevice);
}

// The inspector shows devices (ADR 0030 point 2, first step): say so where
// the tree's properties would be.
function deviceNote(state: ViewerState, translate: Translate): string | null {
  const document = state.openPantin?.document;
  const device = state.selectedDevice;
  const name = document === undefined || device === null ? null : deviceName(document, device);
  return device === null || name === null
    ? null
    : translate("properties.shownInInspector", {
        name,
        kind: translate(`diagram.kind.${device.kind}`),
      });
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
    welcome: buildWelcomeView(state, translate),
    treeRows: flattenTree(buildTree(state, translate), state, relatedJointsOf(state)),
    propertiesNote: deviceNote(state, translate),
    properties: buildPropertyGroups(
      state,
      state.selectedNodeId,
      state.collapsedPropertyGroups,
      translate,
    ),
    importForm: buildImportFormView(state, translate),
    jointForm: buildJointFormView(state, translate),
    jointSlider: selectedJointSlider(state),
    contextMenu: buildContextMenuView(state, translate),
    prompt: buildPromptView(state, translate),
    message: buildMessageView(state, translate),
    viewportHint: translate(mode === "list" ? "page.viewportEmpty" : "page.viewportHint"),
    inspector: buildInspectorView(state, translate),
  };
}
