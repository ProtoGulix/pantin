import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AlignmentSide } from "@pantin/protocol";
import type { FaceHighlight } from "../alignment/alignment-session.ts";
import type { ScenePalette } from "../theme/scene-palette.ts";
import type { LoadedBody } from "./body-loader.ts";
import { faceSideLook, outlineWidthInMeshSpace } from "./scene-plan.ts";

// The faces picked for an alignment (ADR 0035 point 3), tinted whole: a copy
// of the picked mesh's triangles of that face, parented to it so that it
// follows the body, drawn slightly in front of it.

export interface FaceHighlights {
  show(highlights: readonly FaceHighlight[]): void;
  setPalette(palette: ScenePalette): void;
}

// The moving side plays the part of a joint preview's child: the theme's
// selection blue and an outline. The target plays the parent: the theme's joint
// parent colour, tint alone (faceSideLook). Colour is not the only cue.

function sideColor(side: AlignmentSide, palette: ScenePalette): string {
  return palette[faceSideLook(side).colour];
}

function sideMaterial(scene: Scene, side: AlignmentSide, palette: ScenePalette): StandardMaterial {
  const material = new StandardMaterial(`face-highlight:${side}`, scene);
  material.emissiveColor = Color3.FromHexString(sideColor(side, palette));
  material.disableLighting = true;
  material.backFaceCulling = false;
  // Drawn in front of the body's own triangles at the same place.
  material.zOffset = -2;
  return material;
}

// The outline needs the normals, copied from the source; its width follows the
// picked mesh's size, like the outline of a selected body.
function outlineFace(face: Mesh, source: AbstractMesh, color: Color3): void {
  source.computeWorldMatrix(true);
  const extent = source.getBoundingInfo().boundingBox.extendSizeWorld.length() * 2;
  face.computeWorldMatrix(true);
  face.renderOutline = true;
  face.outlineColor = color;
  face.outlineWidth = outlineWidthInMeshSpace(extent, Math.abs(face.absoluteScaling.x));
}

function faceMesh(
  scene: Scene,
  source: AbstractMesh,
  highlight: FaceHighlight,
  material: StandardMaterial,
  outlineColor: Color3,
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
  // An outline needs normals: computed from the triangles when the source has none.
  const normals = source.getVerticesData(VertexBuffer.NormalKind);
  if (normals !== null) {
    data.normals = normals;
  } else {
    data.normals = [];
    VertexData.ComputeNormals(positions, data.indices, data.normals);
  }
  const mesh = new Mesh(`face-highlight:${highlight.bodyId}`, scene);
  data.applyToMesh(mesh);
  mesh.parent = source;
  mesh.isPickable = false;
  mesh.material = material;
  if (faceSideLook(highlight.side).outlined) {
    outlineFace(mesh, source, outlineColor);
  }
  return mesh;
}

export function createFaceHighlights(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  palette: ScenePalette,
): FaceHighlights {
  const materials: Record<AlignmentSide, StandardMaterial> = {
    moving: sideMaterial(scene, "moving", palette),
    target: sideMaterial(scene, "target", palette),
  };
  let outlineColor = Color3.FromHexString(palette.selection);
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
            : faceMesh(scene, source, highlight, materials[highlight.side], outlineColor);
        return mesh === null ? [] : [mesh];
      });
    },
    setPalette: (next) => {
      outlineColor = Color3.FromHexString(next.selection);
      for (const side of ["moving", "target"] as const) {
        materials[side].emissiveColor = Color3.FromHexString(sideColor(side, next));
      }
      for (const mesh of meshes) {
        if (mesh.renderOutline) {
          mesh.outlineColor = outlineColor;
        }
      }
    },
  };
}
