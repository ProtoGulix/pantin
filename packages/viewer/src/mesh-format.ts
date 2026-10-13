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

export interface MeshLoaderOptions {
  // Babylon picks the plugin from this, since the bytes carry no file name.
  pluginExtension: `.${MeshFileFormat}`;
  // Name of the in-memory file handed to the loader (shown in its errors).
  fileName: string;
}

// Babylon cannot load an STL from a bare ArrayBufferView (its STL plugin has
// no loadFile), but it reads a File through the generic path. The File is
// named after the mesh path so that the extension stays visible in errors.
export function meshLoaderOptions(meshPath: string, format: MeshFileFormat): MeshLoaderOptions {
  const fileName = meshPath.split("/").pop() ?? meshPath;
  return { pluginExtension: `.${format}`, fileName };
}
