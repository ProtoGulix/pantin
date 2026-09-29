import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createJointArrow } from "./joint-arrow.ts";
import { type BodyHighlight, bodyHighlight, placeJointArrow } from "./scene-plan.ts";

// What the viewport draws over the bodies: the tint of the selected bodies
// (one body, or an assembly's) or of a previewed joint's two bodies, and that
// joint's arrow. The bodies are the viewport's own map, read here and never
// changed.

export interface BodyHighlights {
  setSelectedBodies(bodyIds: ReadonlySet<string>): void;
  setJointPreview(preview: JointPreview | null): void;
  /** After bodies were loaded: new meshes get their tint, the arrow its size. */
  redraw(): void;
  /** A body's pose of this frame; the arrow moves with the previewed parent. */
  followPose(bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple): void;
  /** Poses were forgotten: the arrow goes back to the reference placement. */
  resetPose(): void;
}

// Parent and child match the swatches of the joint form (--joint-parent and
// --joint-child in base.css); the child is the body that moves.
const SELECTION_COLOR = Color3.FromHexString("#f0a030");
const HIGHLIGHT_COLORS: Readonly<Record<BodyHighlight, Color3>> = {
  selected: SELECTION_COLOR,
  parent: Color3.FromHexString("#a371f7"),
  child: SELECTION_COLOR,
};
const NO_DISPLACEMENT = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } as const;

export function createBodyHighlights(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
): BodyHighlights {
  const arrow = createJointArrow(scene);
  let selectedBodyIds: ReadonlySet<string> = new Set();
  let preview: JointPreview | null = null;

  const tintBodies = () => {
    for (const [bodyId, loaded] of loadedBodies) {
      const highlight = bodyHighlight(bodyId, selectedBodyIds, preview);
      for (const mesh of loaded.meshes) {
        mesh.renderOverlay = highlight !== null;
        mesh.overlayColor = HIGHLIGHT_COLORS[highlight ?? "selected"];
        mesh.overlayAlpha = 0.35;
      }
    }
  };
  // Sized on the child body, so it waits for that body's mesh.
  const drawArrow = () => {
    const child = preview === null ? undefined : loadedBodies.get(preview.childBodyId);
    if (preview === null || preview.origin === null || preview.axis === null || !child) {
      arrow.hide();
      return;
    }
    const bounds = child.node.getHierarchyBoundingVectors(true);
    const extent = bounds.max.subtract(bounds.min).length();
    arrow.show(placeJointArrow(preview.origin, preview.axis, extent));
  };

  return {
    setSelectedBodies: (bodyIds) => {
      selectedBodyIds = bodyIds;
      tintBodies();
    },
    setJointPreview: (next) => {
      // Until the next frame, in case the new parent has no pose at all.
      if (next?.parentBodyId !== preview?.parentBodyId) {
        arrow.follow(NO_DISPLACEMENT);
      }
      preview = next;
      tintBodies();
      drawArrow();
    },
    redraw: () => {
      tintBodies();
      drawArrow();
    },
    followPose: (bodyId, translation, rotation) => {
      if (bodyId === preview?.parentBodyId) {
        arrow.follow(coreDisplacementToBabylon(translation, rotation));
      }
    },
    resetPose: () => arrow.follow(NO_DISPLACEMENT),
  };
}
