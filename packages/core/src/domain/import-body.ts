import {
  type Body,
  BodySchema,
  type ImportBodyQuery,
  type MeshFormat,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinDocument,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { extractGlbNodes, hasGlbHeader } from "./glb.ts";
import { fileNameStem, makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { isAsciiStl, isBinaryStl } from "./stl.ts";
import { parseWithSchema } from "./validation.ts";

const MAX_DISPLAY_NAME_LENGTH = 200;

// The format comes from the content, never from the file name extension.
export function detectMeshFormat(bytes: Uint8Array): MeshFormat | undefined {
  if (hasGlbHeader(bytes)) {
    return "glb";
  }
  if (isBinaryStl(bytes) || isAsciiStl(bytes)) {
    return "stl";
  }
  return undefined;
}

function buildSource(
  format: MeshFormat,
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

// Builds the body for an imported file. The body id comes from the file name,
// made unique among the Pantin's bodies and `otherTakenIds` (e.g. mesh files
// left by unsaved imports); the mesh lives at meshes/<bodyId>.<format>.
export function buildImportedBody(
  document: PantinDocument,
  query: ImportBodyQuery,
  bytes: Uint8Array,
  otherTakenIds: Iterable<string>,
): Body {
  const format = detectMeshFormat(bytes);
  if (format === undefined) {
    throw new ApiError(
      "unsupported_file",
      `"${query.fileName}" is neither a GLB (glTF 2.0 binary) nor an STL file. Export it as GLB or STL.`,
    );
  }
  const stem = fileNameStem(query.fileName);
  const takenIds = new Set([...document.bodies.map((body) => body.id), ...otherTakenIds]);
  const id = makeUniqueId(slugifyDisplayName(stem, "body"), takenIds);
  const body: Body = {
    id,
    name: stem.trim().slice(0, MAX_DISPLAY_NAME_LENGTH),
    source: buildSource(format, query, bytes),
    mesh: `${PANTIN_MESHES_DIRECTORY_NAME}/${id}.${format}`,
  };
  return parseWithSchema(BodySchema, body, "The imported body");
}
