import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

// The JSON pointers Babylon's glTF loader records on what it creates
// (`_internalMetadata.gltf.pointers`, an internal field: ADR 0035 says a
// Babylon upgrade must rerun gltf-pointers.test.ts). Read without trusting
// its shape: anything unexpected gives no pointer, hence the fallback pick.
export function gltfPointersOf(mesh: AbstractMesh): string[] {
  const metadata: unknown = mesh._internalMetadata;
  if (typeof metadata !== "object" || metadata === null || !("gltf" in metadata)) {
    return [];
  }
  const { gltf } = metadata;
  if (typeof gltf !== "object" || gltf === null || !("pointers" in gltf)) {
    return [];
  }
  const { pointers } = gltf;
  return Array.isArray(pointers)
    ? pointers.filter((pointer): pointer is string => typeof pointer === "string")
    : [];
}
