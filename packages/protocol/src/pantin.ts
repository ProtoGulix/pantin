import { z } from "zod";

// A Pantin is a folder on disk: `pantin.json` plus a `meshes/` directory.
// The folder name is the Pantin id; the display name lives in the document.

export const PANTIN_SCHEMA_VERSION = 1;

export const PANTIN_DOCUMENT_FILE_NAME = "pantin.json";
export const PANTIN_MESHES_DIRECTORY_NAME = "meshes";

// Ids become folder and file names. The pattern excludes dots and slashes, so
// an id can never escape its parent directory ("..", "a/b", "/etc").
const SAFE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function safeIdSchema() {
  return z
    .string()
    .regex(
      SAFE_ID_PATTERN,
      "Must be 1 to 64 lowercase letters, digits or dashes, not at the ends.",
    );
}

export const PantinIdSchema = safeIdSchema();
export type PantinId = z.infer<typeof PantinIdSchema>;

export const BodyIdSchema = safeIdSchema();
export type BodyId = z.infer<typeof BodyIdSchema>;

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Name must not be empty.")
  .max(200, "Name must be at most 200 characters.");

// Format of the file the user imported. STEP is converted by the core into one
// GLB per assembly component, so a body's mesh file is always GLB or STL: read
// the mesh format from the extension of `mesh`, not from `source.format`.
export const SourceFormatSchema = z.enum(["glb", "stl", "step"]);
export type SourceFormat = z.infer<typeof SourceFormatSchema>;

export const LengthUnitSchema = z.enum(["m", "mm", "cm", "in"]);
export type LengthUnit = z.infer<typeof LengthUnitSchema>;

// Which axis points up inside the mesh file. glTF is Y up by specification,
// but CAD exports (OpenCascade, spike 0001) often keep Z up.
export const UpAxisSchema = z.enum(["y", "z"]);
export type UpAxis = z.infer<typeof UpAxisSchema>;

// A node name found in the imported file, kept verbatim and never edited, so
// that renaming a body never loses the link with the CAD source.
export const SourceNodeSchema = z.object({
  name: z.string(),
  // Indices from the file's root to this node, to tell apart duplicate names.
  path: z.array(z.number().int().nonnegative()),
});
export type SourceNode = z.infer<typeof SourceNodeSchema>;

export const BodySchema = z.object({
  id: BodyIdSchema,
  name: DisplayNameSchema,
  source: z.object({
    fileName: z.string().min(1),
    format: SourceFormatSchema,
    unit: LengthUnitSchema,
    upAxis: UpAxisSchema,
    nodes: z.array(SourceNodeSchema),
  }),
  // Path relative to the Pantin folder, e.g. "meshes/rail.glb"; ends in .glb or .stl.
  mesh: z.string().min(1),
});
export type Body = z.infer<typeof BodySchema>;

export const PantinDocumentSchema = z.object({
  schema_version: z.literal(PANTIN_SCHEMA_VERSION),
  name: DisplayNameSchema,
  bodies: z.array(BodySchema).superRefine((bodies, context) => {
    // Body ids name mesh files, so a duplicate would silently share one file.
    const seenIds = new Set<string>();
    for (const [index, body] of bodies.entries()) {
      if (seenIds.has(body.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Body id "${body.id}" is used twice; body ids must be unique.`,
        });
      }
      seenIds.add(body.id);
    }
  }),
});
export type PantinDocument = z.infer<typeof PantinDocumentSchema>;
