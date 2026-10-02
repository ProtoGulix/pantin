import { z } from "zod";

// The face file of a STEP body (ADR 0035 point 2): which B-rep face each
// triangle of the body's GLB comes from, and the geometry of those faces.
// The STEP converter writes it next to the GLB; the core keeps it at
// `meshes/<bodyId>.faces.json` and serves it like the mesh:
//
//   GET /api/pantins/:pantinId/meshes/<bodyId>.faces.json  -> FaceFile
//
// STL and GLB bodies, bodies imported before ADR 0035, and STEP bodies whose
// face map the converter could not prove have none (404).
//
// Lengths are in metres, in the frame where the GLB places the body (after
// its node transforms). Plane normals point out of the material; on a body
// that is not a closed solid (`solid: false`) they keep the face orientation.

export const FACE_FILE_FORMAT_VERSION = 1;
export const FACE_FILE_EXTENSION = ".faces.json";

const Vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const FaceGeometrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plane"), point: Vector3Schema, normal: Vector3Schema }),
  // `direction`: the axis of the B-rep surface, whose sign is arbitrary.
  z.object({
    kind: z.literal("cylinder"),
    point: Vector3Schema,
    direction: Vector3Schema,
    radius: z.number().finite().positive(),
  }),
  z.object({ kind: z.literal("other") }),
]);
export type FaceGeometry = z.infer<typeof FaceGeometrySchema>;

const CountSchema = z.number().int().nonnegative();

// [first triangle, triangle count, face index]: triangles of the primitive's
// index list, in order, that belong to one face.
const FaceRangeSchema = z.tuple([CountSchema, z.number().int().positive(), CountSchema]);

const MappedPrimitiveSchema = z.object({
  // Indices of the glTF mesh and of the primitive inside it.
  mesh: CountSchema,
  primitive: CountSchema,
  ranges: z.array(FaceRangeSchema),
});

export const FaceFileSchema = z
  .object({
    formatVersion: z.literal(FACE_FILE_FORMAT_VERSION),
    // The OpenCascade binding that wrote the GLB, e.g. "cadquery-ocp-novtk 8.0.1.0.0".
    writer: z.string().min(1).max(200),
    solid: z.boolean(),
    primitives: z.array(MappedPrimitiveSchema),
    faces: z.array(FaceGeometrySchema),
  })
  .superRefine((faceFile, context) => {
    const faceCount = faceFile.faces.length;
    for (const [primitiveIndex, mapped] of faceFile.primitives.entries()) {
      for (const [rangeIndex, [, , faceIndex]] of mapped.ranges.entries()) {
        if (faceIndex >= faceCount) {
          context.addIssue({
            code: "custom",
            path: ["primitives", primitiveIndex, "ranges", rangeIndex, 2],
            message: `Face ${faceIndex} does not exist: the file has ${faceCount} faces.`,
          });
        }
      }
    }
  });
export type FaceFile = z.infer<typeof FaceFileSchema>;

/** The face file name of a GLB mesh path: "meshes/rail.glb" -> "meshes/rail.faces.json". */
export function faceFilePathOf(meshPath: string): string | undefined {
  return meshPath.endsWith(".glb")
    ? `${meshPath.slice(0, -".glb".length)}${FACE_FILE_EXTENSION}`
    : undefined;
}
