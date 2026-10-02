import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";
import type { FaceHighlight } from "../alignment/alignment-session.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createFaceHighlights } from "./face-highlights.ts";

// The picked face is tinted with a copy of exactly its triangles, attached to
// the picked mesh so that it follows the body (ADR 0035 point 3).

function sceneWithBox() {
  const scene = new Scene(new NullEngine());
  const box = CreateBox("box", { size: 1 }, scene);
  const loaded: LoadedBody = {
    node: new TransformNode("body", scene),
    meshes: [box],
    setDisplacement: () => undefined,
    dispose: () => undefined,
  };
  return { scene, box, highlights: createFaceHighlights(scene, new Map([["block", loaded]])) };
}

const SIDE: FaceHighlight = {
  bodyId: "block",
  meshIndex: 0,
  firstTriangle: 2,
  triangleCount: 2,
  side: "moving",
};

describe("face highlights", () => {
  it("copies the face's triangles under the picked mesh, and replaces them on the next show", () => {
    const { scene, box, highlights } = sceneWithBox();
    highlights.show([SIDE]);
    const [tint] = box.getChildMeshes();
    expect(Array.from(tint?.getIndices() ?? [])).toEqual(
      Array.from(box.getIndices() ?? []).slice(6, 12),
    );
    expect(tint?.isPickable).toBe(false);
    highlights.show([]);
    expect(box.getChildMeshes()).toEqual([]);
    scene.dispose();
  });
});
