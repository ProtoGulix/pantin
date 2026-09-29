import type { ImportBodyQuery, LengthUnit, SourceFormat, UpAxis } from "@pantin/protocol";

// The choices the user makes before a file is sent to the core.
export interface PendingImport {
  fileName: string;
  format: SourceFormat;
  // Only sent for STL; kept for every format so the form state stays simple.
  unit: LengthUnit;
  upAxis: UpAxis;
}

const EXTENSION_TO_FORMAT: Readonly<Record<string, SourceFormat>> = {
  glb: "glb",
  stl: "stl",
  stp: "step",
  step: "step",
};

export const IMPORT_FILE_ACCEPT = ".glb,.stl,.stp,.step";

export function detectSourceFormat(fileName: string): SourceFormat | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }
  return EXTENSION_TO_FORMAT[fileName.slice(dotIndex + 1).toLowerCase()] ?? null;
}

// Defaults follow the contract: glTF is Y up and in metres by specification;
// STL carries no unit, and CAD exports are usually Z up in millimetres; STEP
// declares its own unit and comes from CAD, so Z up.
const DEFAULTS: Readonly<Record<SourceFormat, { unit: LengthUnit; upAxis: UpAxis }>> = {
  glb: { unit: "m", upAxis: "y" },
  stl: { unit: "mm", upAxis: "z" },
  step: { unit: "m", upAxis: "z" },
};

export function createPendingImport(fileName: string): PendingImport | null {
  const format = detectSourceFormat(fileName);
  return format === null ? null : { fileName, format, ...DEFAULTS[format] };
}

/** Whether the user must pick a unit: only STL, which carries none. */
export function importNeedsUnit(pendingImport: PendingImport): boolean {
  return pendingImport.format === "stl";
}

export function buildImportQuery(pendingImport: PendingImport): ImportBodyQuery {
  const query: ImportBodyQuery = { fileName: pendingImport.fileName, upAxis: pendingImport.upAxis };
  return importNeedsUnit(pendingImport) ? { ...query, unit: pendingImport.unit } : query;
}
