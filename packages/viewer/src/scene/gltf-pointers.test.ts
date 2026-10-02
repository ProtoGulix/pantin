import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import { gltfPointersOf } from "./gltf-pointers.ts";

// ADR 0035 point 3 maps a pick to a face through two facts about Babylon's
// glTF loader, checked here on a real load so that an upgrade that breaks
// them fails this test: each primitive becomes its own mesh carrying its JSON
// pointer in `_internalMetadata.gltf.pointers`, and its indices keep the glTF
// order, so the picked triangle index is the face file's triangle index.

const POSITIONS = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
const FIRST_INDICES = [0, 1, 2, 0, 2, 3];
const SECOND_INDICES = [1, 2, 3];

function chunk(bytes: Uint8Array, type: number, padding: number): Uint8Array {
  const length = Math.ceil(bytes.byteLength / 4) * 4;
  const out = new Uint8Array(8 + length).fill(padding);
  const view = new DataView(out.buffer);
  view.setUint32(0, length, true);
  view.setUint32(4, type, true);
  out.set(bytes, 8);
  return out;
}

function twoPrimitiveGlb(): Uint8Array {
  const positions = new Float32Array(POSITIONS);
  const indices = new Uint16Array([...FIRST_INDICES, ...SECOND_INDICES]);
  const binary = new Uint8Array(positions.byteLength + indices.byteLength + 2);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, indices: 1 },
          { attributes: { POSITION: 0 }, indices: 2 },
        ],
      },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 1, byteOffset: 12, componentType: 5123, count: 3, type: "SCALAR" },
    ],
  };
  const json = chunk(new TextEncoder().encode(JSON.stringify(gltf)), 0x4e4f534a, 0x20);
  const bin = chunk(binary, 0x004e4942, 0);
  const glb = new Uint8Array(12 + json.byteLength + bin.byteLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.byteLength, true);
  glb.set(json, 12);
  glb.set(bin, 12 + json.byteLength);
  return glb;
}

describe("Babylon's glTF loader, as the face pick relies on it", () => {
  it("makes one mesh per primitive, with its pointer and its indices in glTF order", async () => {
    const scene = new Scene(new NullEngine());
    const container = await LoadAssetContainerAsync(twoPrimitiveGlb(), scene, {
      pluginExtension: ".glb",
    });
    const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    const byPointer = new Map(
      meshes.map((mesh) => [
        gltfPointersOf(mesh).find((pointer) => pointer.includes("primitives")),
        mesh,
      ]),
    );
    expect(Array.from(byPointer.get("/meshes/0/primitives/0")?.getIndices() ?? [])).toEqual(
      FIRST_INDICES,
    );
    expect(Array.from(byPointer.get("/meshes/0/primitives/1")?.getIndices() ?? [])).toEqual(
      SECOND_INDICES,
    );
    scene.dispose();
  });
});
