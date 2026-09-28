import type { Body, LengthUnit, SourceFormat, SourceNode, UpAxis } from "@pantin/protocol";
import { PantinApiError } from "./api-client.ts";
import { importNeedsUnit, SOURCE_FORMAT_LABELS } from "./import-options.ts";
import type { ViewerState } from "./viewer-state.ts";

// Display logic: turns ViewerState into exactly what the panel shows, as plain
// data. No DOM here, so every rule is unit tested under Node.

export interface PantinListRowView {
  id: string;
  name: string;
  bodyCountLabel: string;
  isOpen: boolean;
}

interface SourceNodeView {
  label: string;
  // Index path from the file root, telling apart nodes that share a name.
  pathLabel: string;
}

export interface BodyRowView {
  id: string;
  displayName: string;
  sourceFileName: string;
  sourceFormatLabel: string;
  sourceNodes: SourceNodeView[];
  unitLabel: string;
  upAxisLabel: string;
  isSelected: boolean;
}

export interface OpenPantinView {
  id: string;
  name: string;
  hasUnsavedChanges: boolean;
  saveEnabled: boolean;
  bodies: BodyRowView[];
  emptyBodiesMessage: string | null;
}

export interface ImportFormView {
  fileName: string;
  formatLabel: string;
  showUnit: boolean;
  unit: LengthUnit;
  upAxis: UpAxis;
  // Shown instead of the buttons while the core works on the file.
  progressMessage: string | null;
  canSubmit: boolean;
}

export interface PanelView {
  busy: boolean;
  errorMessage: string | null;
  pantins: PantinListRowView[];
  emptyListMessage: string | null;
  openPantin: OpenPantinView | null;
  importForm: ImportFormView | null;
}

export const UNIT_LABELS: Readonly<Record<LengthUnit, string>> = {
  m: "m (metres)",
  mm: "mm (millimetres)",
  cm: "cm (centimetres)",
  in: "in (inches)",
};

export const UP_AXIS_LABELS: Readonly<Record<UpAxis, string>> = {
  y: "Y up (glTF standard)",
  z: "Z up (CAD)",
};

function bodyCountLabel(count: number): string {
  return count === 1 ? "1 body" : `${count} bodies`;
}

function sourceNodeView(node: SourceNode): SourceNodeView {
  return {
    label: node.name === "" ? "(unnamed node)" : node.name,
    pathLabel: node.path.length === 0 ? "root" : node.path.join(" / "),
  };
}

export function buildBodyRowView(body: Body, selectedBodyId: string | null): BodyRowView {
  return {
    id: body.id,
    displayName: body.name,
    sourceFileName: body.source.fileName,
    sourceFormatLabel: SOURCE_FORMAT_LABELS[body.source.format],
    sourceNodes: body.source.nodes.map(sourceNodeView),
    unitLabel: UNIT_LABELS[body.source.unit],
    upAxisLabel: UP_AXIS_LABELS[body.source.upAxis],
    isSelected: body.id === selectedBodyId,
  };
}

function buildOpenPantinView(state: ViewerState, busy: boolean): OpenPantinView | null {
  const openPantin = state.openPantin;
  if (openPantin === null) {
    return null;
  }
  const bodies = openPantin.document.bodies;
  return {
    id: openPantin.id,
    name: openPantin.document.name,
    hasUnsavedChanges: openPantin.unsavedChanges,
    saveEnabled: openPantin.unsavedChanges && !busy,
    bodies: bodies.map((body) => buildBodyRowView(body, state.selectedBodyId)),
    emptyBodiesMessage:
      bodies.length === 0 ? "No body yet. Import a .glb or .stl file to add one." : null,
  };
}

function importProgressMessage(format: SourceFormat): string {
  return format === "step"
    ? "Converting the STEP file… This can take up to 2 minutes; keep this page open."
    : "Importing…";
}

function buildImportFormView(state: ViewerState): ImportFormView | null {
  const pendingImport = state.pendingImport;
  if (pendingImport === null) {
    return null;
  }
  return {
    fileName: pendingImport.fileName,
    formatLabel: SOURCE_FORMAT_LABELS[pendingImport.format],
    showUnit: importNeedsUnit(pendingImport),
    unit: pendingImport.unit,
    upAxis: pendingImport.upAxis,
    progressMessage: state.importInProgress ? importProgressMessage(pendingImport.format) : null,
    canSubmit: !state.importInProgress && state.pendingRequestCount === 0,
  };
}

export function buildPanelView(state: ViewerState): PanelView {
  const busy = state.pendingRequestCount > 0;
  return {
    busy,
    errorMessage: state.errorMessage,
    pantins: state.pantins.map((summary) => ({
      id: summary.id,
      name: summary.name,
      bodyCountLabel: bodyCountLabel(summary.bodyCount),
      isOpen: summary.id === state.openPantin?.id,
    })),
    emptyListMessage: state.pantins.length === 0 ? "No Pantin yet. Create one below." : null,
    openPantin: buildOpenPantinView(state, busy),
    importForm: buildImportFormView(state),
  };
}

function describeApiError(error: PantinApiError): string {
  if (error.kind === "invalid_response") {
    return `The core sent an unexpected answer. ${error.message}`;
  }
  switch (error.code) {
    case "conversion_unavailable":
      return (
        `STEP import is not available on this core: ${error.message} ` +
        "Start the core with --step-converter-python <path to the converter's Python>, " +
        "or export the part as GLB or STL from your CAD."
      );
    case "conversion_failed":
      return (
        `The STEP file could not be converted: ${error.message} ` +
        "Check that it opens in your CAD and re-export it as STEP (AP214 or AP242), " +
        "or export it as GLB or STL."
      );
    default:
      return error.message;
  }
}

/** One actionable sentence for any failure, shown in the error banner. */
export function describeFailure(error: unknown): string {
  if (error instanceof PantinApiError) {
    return describeApiError(error);
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `Unexpected error: ${reason}`;
}
