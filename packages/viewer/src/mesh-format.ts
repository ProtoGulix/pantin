// Which Babylon loader reads a body's mesh file. The source format is not
// enough: a STEP import is converted by the core into GLB files (ADR 0009), so
// the mesh format is read from the extension of `body.mesh`, as the contract says.
export type MeshFileFormat = "glb" | "stl";

const EXTENSION_TO_MESH_FORMAT: Readonly<Record<string, MeshFileFormat>> = {
  glb: "glb",
  stl: "stl",
};

export function meshFormatFromPath(meshPath: string): MeshFileFormat | null {
  const fileName = meshPath.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }
  return EXTENSION_TO_MESH_FORMAT[fileName.slice(dotIndex + 1).toLowerCase()] ?? null;
}
