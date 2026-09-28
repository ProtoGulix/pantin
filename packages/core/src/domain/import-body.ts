import {
  type Body,
  BodySchema,
  type ImportBodyQuery,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinDocument,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { extractGlbNodes, hasGlbHeader } from "./glb.ts";
import { fileNameStem, makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { isStepFile } from "./step.ts";
import { isAsciiStl, isBinaryStl } from "./stl.ts";
import { parseWithSchema } from "./validation.ts";

const MAX_DISPLAY_NAME_LENGTH = 200;

// Formats stored as they are, one file giving one body.
type DirectMeshFormat = "glb" | "stl";
export type ImportFormat = DirectMeshFormat | "step";

// The format comes from the content, never from the file name extension.
export function detectImportFormat(bytes: Uint8Array): ImportFormat | undefined {
  if (hasGlbHeader(bytes)) {
    return "glb";
  }
  if (isBinaryStl(bytes) || isAsciiStl(bytes)) {
    return "stl";
  }
  return isStepFile(bytes) ? "step" : undefined;
}

export function unsupportedFileError(fileName: string): ApiError {
  return new ApiError(
    "unsupported_file",
    `"${fileName}" is not a GLB (glTF 2.0 binary), STL or STEP (ISO 10303-21) file. Export it in one of these formats.`,
  );
}

// Display name limited to what DisplayNameSchema accepts, or `fallback`.
export function toDisplayName(text: string, fallback: string): string {
  const trimmed = text.trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
  return trimmed === "" ? fallback : trimmed;
}

function buildSource(
  format: DirectMeshFormat,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Body["source"] {
  if (format === "glb") {
    // glTF is metres and Y up by specification; the query may only override the axis.
    return {
      fileName: query.fileName,
      format,
      unit: "m",
      upAxis: query.upAxis ?? "y",
      nodes: extractGlbNodes(bytes),
    };
  }
  if (query.unit === undefined) {
    throw new ApiError(
      "invalid_request",
      'STL files carry no unit: add the "unit" query parameter (m, mm, cm or in).',
    );
  }
  return {
    fileName: query.fileName,
    format,
    unit: query.unit,
    upAxis: query.upAxis ?? "z",
    nodes: [],
  };
}

// Builds the body for an imported GLB or STL file. The body id comes from the
// file name, made unique among the Pantin's bodies and `otherTakenIds` (e.g.
// mesh files left by unsaved imports); the mesh lives at meshes/<bodyId>.<format>.
export function buildImportedBody(
  document: PantinDocument,
  query: ImportBodyQuery,
  format: DirectMeshFormat,
  bytes: Uint8Array,
  otherTakenIds: Iterable<string>,
): Body {
  const stem = fileNameStem(query.fileName);
  const takenIds = new Set([...document.bodies.map((body) => body.id), ...otherTakenIds]);
  const id = makeUniqueId(slugifyDisplayName(stem, "body"), takenIds);
  const body: Body = {
    id,
    name: toDisplayName(stem, "Body"),
    source: buildSource(format, query, bytes),
    mesh: `${PANTIN_MESHES_DIRECTORY_NAME}/${id}.${format}`,
  };
  return parseWithSchema(BodySchema, body, "The imported body");
}
