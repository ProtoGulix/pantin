import type { ImportBodyQuery, LengthUnit, MeshFormat, UpAxis } from "@pantin/protocol";

// The choices the user makes before a file is sent to the core.
export interface PendingImport {
  fileName: string;
  format: MeshFormat;
  unit: LengthUnit;
  upAxis: UpAxis;
}

const EXTENSION_TO_FORMAT: Readonly<Record<string, MeshFormat>> = { glb: "glb", stl: "stl" };

export const IMPORT_FILE_ACCEPT = ".glb,.stl";

export function detectMeshFormat(fileName: string): MeshFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_FORMAT[extension] ?? null;
}

// Defaults follow the contract: glTF is Y up and in metres by specification;
// STL carries no unit, and CAD exports are usually Z up in millimetres.
export function createPendingImport(fileName: string): PendingImport | null {
  const format = detectMeshFormat(fileName);
  if (format === null) {
    return null;
  }
  return format === "glb"
    ? { fileName, format, unit: "m", upAxis: "y" }
    : { fileName, format, unit: "mm", upAxis: "z" };
}

/** Whether the user must pick a unit: only STL, which carries none. */
export function importNeedsUnit(pendingImport: PendingImport): boolean {
  return pendingImport.format === "stl";
}

export function buildImportQuery(pendingImport: PendingImport): ImportBodyQuery {
  const query: ImportBodyQuery = { fileName: pendingImport.fileName, upAxis: pendingImport.upAxis };
  return importNeedsUnit(pendingImport) ? { ...query, unit: pendingImport.unit } : query;
}
