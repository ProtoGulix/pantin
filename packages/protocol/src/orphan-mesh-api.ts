import { z } from "zod";

// Cleaning orphan mesh files (ADR 0038), under API_PREFIX. An orphan is a
// `.glb`, `.stl` or `.faces.json` file of a Pantin's `meshes/` folder that no
// body uses (nor the saved pantin.json, a save in progress or a deletion
// waiting for the next save).
//
//   GET  /api/pantins/:pantinId/orphan-meshes  -> OrphanMeshList
//        (the dry run: changes nothing; 404 for an unknown Pantin, 400 when
//        `meshes/` is a symbolic link)
//   POST /api/pantins/:pantinId/orphan-meshes/delete  OrphanMeshDeletionRequest
//        -> OrphanMeshDeletionResponse
//        (the core recomputes the orphans and deletes only the names that are
//        both requested and still orphans; a file that fails does not stop the
//        others and the answer is still 200; 400 for an invalid body)
//
// The document never changes, so neither answer carries a PantinResponse.

export const MAX_ORPHAN_DELETIONS_PER_REQUEST = 200;

// A name inside the meshes folder: never a path, so it cannot leave it.
export const MeshFolderFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !/[/\\\0]/.test(name) && name !== "." && name !== "..", {
    message: "A mesh file name has no slash, backslash or NUL, and is not . or ..",
  });
export type MeshFolderFileName = z.infer<typeof MeshFolderFileNameSchema>;

export const OrphanMeshFileSchema = z.object({
  fileName: MeshFolderFileNameSchema,
  sizeInBytes: z.number().int().nonnegative(),
});
export type OrphanMeshFile = z.infer<typeof OrphanMeshFileSchema>;

// Sorted by file name.
export const OrphanMeshListSchema = z.object({
  files: z.array(OrphanMeshFileSchema),
  totalSizeInBytes: z.number().int().nonnegative(),
});
export type OrphanMeshList = z.infer<typeof OrphanMeshListSchema>;

export const OrphanMeshDeletionRequestSchema = z.object({
  fileNames: z.array(MeshFolderFileNameSchema).max(MAX_ORPHAN_DELETIONS_PER_REQUEST),
});
export type OrphanMeshDeletionRequest = z.infer<typeof OrphanMeshDeletionRequestSchema>;

// `skipped`: no longer orphans, no longer there, or not mesh files.
// `failed`: the `unlink` failed; `errorCode` is the Node.js code ("EACCES"...)
// or "unknown", never a message, which could reveal an absolute path.
export const OrphanMeshDeletionResponseSchema = z.object({
  deleted: z.array(OrphanMeshFileSchema),
  skipped: z.array(z.string()),
  failed: z.array(z.object({ fileName: MeshFolderFileNameSchema, errorCode: z.string() })),
});
export type OrphanMeshDeletionResponse = z.infer<typeof OrphanMeshDeletionResponseSchema>;
