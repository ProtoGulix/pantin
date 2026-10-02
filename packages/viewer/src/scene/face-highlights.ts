import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AlignmentSide } from "@pantin/protocol";
import type { FaceHighlight } from "../alignment/alignment-session.ts";
import type { LoadedBody } from "./body-loader.ts";

// The faces picked for an alignment (ADR 0035 point 3), tinted whole: a copy
// of the picked mesh's triangles of that face, parented to it so that it
// follows the body, drawn slightly in front of it.

export interface FaceHighlights {
  show(highlights: readonly FaceHighlight[]): void;
}

// The moving side takes the selection's orange, the target a blue.
const SIDE_COLORS: Readonly<Record<AlignmentSide, string>> = {
  moving: "#f0a030",
  target: "#3fa7ff",
};

function sideMaterial(scene: Scene, side: AlignmentSide): StandardMaterial {
  const material = new StandardMaterial(`face-highlight:${side}`, scene);
  material.emissiveColor = Color3.FromHexString(SIDE_COLORS[side]);
  material.disableLighting = true;
  material.backFaceCulling = false;
  // Drawn in front of the body's own triangles at the same place.
  material.zOffset = -2;
  return material;
}

function faceMesh(
  scene: Scene,
  source: AbstractMesh,
  highlight: FaceHighlight,
  material: StandardMaterial,
): Mesh | null {
  const positions = source.getVerticesData(VertexBuffer.PositionKind);
  const indices = source.getIndices();
  if (positions === null || indices === null) {
    return null;
  }
  const first = highlight.firstTriangle * 3;
  const data = new VertexData();
  data.positions = positions;
  data.indices = Array.from(indices.slice(first, first + highlight.triangleCount * 3));
  const mesh = new Mesh(`face-highlight:${highlight.bodyId}`, scene);
  data.applyToMesh(mesh);
  mesh.parent = source;
  mesh.isPickable = false;
  mesh.material = material;
  return mesh;
}

export function createFaceHighlights(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
): FaceHighlights {
  const materials = {
    moving: sideMaterial(scene, "moving"),
    target: sideMaterial(scene, "target"),
  };
  let meshes: Mesh[] = [];
  // The panel redraws often: the same picks keep their meshes.
  let shownKey = "";
  return {
    show: (highlights) => {
      const key = JSON.stringify(highlights);
      if (key === shownKey && meshes.every((mesh) => !mesh.isDisposed())) {
        return;
      }
      shownKey = key;
      for (const mesh of meshes) {
        mesh.dispose();
      }
      meshes = highlights.flatMap((highlight) => {
        const source = loadedBodies.get(highlight.bodyId)?.meshes[highlight.meshIndex];
        const mesh =
          source === undefined
            ? null
            : faceMesh(scene, source, highlight, materials[highlight.side]);
        return mesh === null ? [] : [mesh];
      });
    },
  };
}
