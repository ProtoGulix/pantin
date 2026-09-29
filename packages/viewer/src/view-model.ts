import type { LengthUnit, SourceFormat, UpAxis } from "@pantin/protocol";
import { createTranslator, LANGUAGES, type Language, type Translate } from "./i18n/translate.ts";
import { importNeedsUnit } from "./import-options.ts";
import type { MessageLevel } from "./messages.ts";
import { buildPropertyGroups, type PropertyGroup } from "./properties/properties-model.ts";
import { parseNodeId } from "./tree/node-ids.ts";
import { buildTree, findNode, flattenTree, type TreeRow } from "./tree/tree-model.ts";
import type { ViewerState } from "./viewer-state.ts";

// Display logic: turns ViewerState into exactly what the panel shows, as plain
// data. No DOM here, so every rule is unit tested under Node.

interface ToolbarView {
  busy: boolean;
  creatingPantin: boolean;
  saveEnabled: boolean;
  hasUnsavedChanges: boolean;
  importEnabled: boolean;
  frameAllEnabled: boolean;
  frameSelectionEnabled: boolean;
}

export interface ImportFormView {
  title: string;
  fileName: string;
  formatLabel: string;
  showUnit: boolean;
  unit: LengthUnit;
  upAxis: UpAxis;
  unitOptions: Readonly<Record<LengthUnit, string>>;
  upAxisOptions: Readonly<Record<UpAxis, string>>;
  // Shown instead of the buttons while the core works on the file.
  progressMessage: string | null;
  canSubmit: boolean;
}

export type ContextAction = "rename" | "frame" | "importInto";

export interface ContextMenuView {
  nodeId: string;
  title: string;
  x: number;
  y: number;
  entries: { action: ContextAction; label: string }[];
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
  languageOptions: Readonly<Record<Language, string>>;
  toolbar: ToolbarView;
  treeRows: TreeRow[];
  properties: PropertyGroup[];
  importForm: ImportFormView | null;
  contextMenu: ContextMenuView | null;
  message: MessageView | null;
}

function importProgressMessage(format: SourceFormat, translate: Translate): string {
  return translate(format === "step" ? "import.converting" : "import.inProgress");
}

function buildImportFormView(state: ViewerState, t: Translate): ImportFormView | null {
  const pendingImport = state.pendingImport;
  if (pendingImport === null || state.openPantin === null) {
    return null;
  }
  return {
    title: t("import.target", { pantinName: state.openPantin.document.name }),
    fileName: pendingImport.fileName,
    formatLabel: t(`format.${pendingImport.format}`),
    showUnit: importNeedsUnit(pendingImport),
    unit: pendingImport.unit,
    upAxis: pendingImport.upAxis,
    unitOptions: { m: t("unit.m"), mm: t("unit.mm"), cm: t("unit.cm"), in: t("unit.in") },
    upAxisOptions: { y: t("upAxis.y"), z: t("upAxis.z") },
    progressMessage: state.importInProgress ? importProgressMessage(pendingImport.format, t) : null,
    canSubmit: !state.importInProgress && state.pendingRequestCount === 0,
  };
}

function buildToolbarView(state: ViewerState): ToolbarView {
  const busy = state.pendingRequestCount > 0;
  const hasBodies = (state.openPantin?.document.bodies.length ?? 0) > 0;
  // Framing needs the selected node to belong to the Pantin shown in 3D.
  const selectedPantinId = parseNodeId(state.selectedNodeId ?? "")?.pantinId;
  return {
    busy,
    creatingPantin: state.creatingPantin,
    saveEnabled: (state.openPantin?.unsavedChanges ?? false) && !busy,
    hasUnsavedChanges: state.openPantin?.unsavedChanges ?? false,
    importEnabled: state.openPantin !== null && !busy && !state.importInProgress,
    frameAllEnabled: hasBodies,
    frameSelectionEnabled: hasBodies && selectedPantinId === state.openPantin?.id,
  };
}

/** Menu entries depend on the node: only Pantins accept an import. */
export function contextEntries(kind: TreeRow["kind"], renamable: boolean): ContextAction[] {
  const entries: ContextAction[] = renamable ? ["rename"] : [];
  entries.push("frame");
  if (kind === "pantin") {
    entries.push("importInto");
  }
  return entries;
}

const CONTEXT_LABELS = {
  rename: "menu.rename",
  frame: "menu.frame",
  importInto: "menu.importInto",
} as const;

function buildContextMenuView(state: ViewerState, t: Translate): ContextMenuView | null {
  const menu = state.contextMenu;
  const node = menu === null ? null : findNode(buildTree(state, t), menu.nodeId);
  if (menu === null || node === null) {
    return null;
  }
  return {
    nodeId: node.id,
    title: t("menu.label", { name: node.label }),
    x: menu.x,
    y: menu.y,
    entries: contextEntries(node.kind, node.renamable).map((action) => ({
      action,
      label: t(CONTEXT_LABELS[action]),
    })),
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

export function buildPanelView(state: ViewerState): PanelView {
  const translate = createTranslator(state.language);
  return {
    translate,
    language: state.language,
    // Cast: Object.fromEntries loses key types; the entries come from LANGUAGES.
    languageOptions: Object.fromEntries(
      LANGUAGES.map((value) => [value, translate(`language.${value}`)]),
    ) as Record<Language, string>,
    toolbar: buildToolbarView(state),
    treeRows: flattenTree(buildTree(state, translate), state),
    properties: buildPropertyGroups(
      state,
      state.selectedNodeId,
      state.collapsedPropertyGroups,
      translate,
    ),
    importForm: buildImportFormView(state, translate),
    contextMenu: buildContextMenuView(state, translate),
    message: buildMessageView(state, translate),
  };
}
