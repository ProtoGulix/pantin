import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createJointArrow } from "./joint-arrow.ts";
import {
  type ArrowPlacement,
  type BodyHighlight,
  bodyHighlight,
  placeJointArrow,
} from "./scene-plan.ts";

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
  /**
   * Poses were forgotten: the arrow is hidden until its parent body has a
   * pose again. Not drawn at the reference placement, which is where no body
   * stands any more once assemblies are placed (ADR 0033).
   */
  forgetPoses(): void;
}

// Parent and child match the swatches of the joint form (--joint-parent and
// --joint-child in base.css); the child is the body that moves.
const SELECTION_COLOR = Color3.FromHexString("#f0a030");
const HIGHLIGHT_COLORS: Readonly<Record<BodyHighlight, Color3>> = {
  selected: SELECTION_COLOR,
  parent: Color3.FromHexString("#a371f7"),
  child: SELECTION_COLOR,
};

/** The latest pose of a body, if the stream gave one (the viewport's interpolator). */
export type LatestPose = (bodyId: string) => InterpolatedPose | undefined;

function tintLoadedBodies(
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  selectedBodyIds: ReadonlySet<string>,
  preview: JointPreview | null,
): void {
  for (const [bodyId, loaded] of loadedBodies) {
    const highlight = bodyHighlight(bodyId, selectedBodyIds, preview);
    for (const mesh of loaded.meshes) {
      mesh.renderOverlay = highlight !== null;
      mesh.overlayColor = HIGHLIGHT_COLORS[highlight ?? "selected"];
      mesh.overlayAlpha = 0.35;
    }
  }
}

// Sized on the child body, so it waits for that body's mesh.
function arrowPlacement(preview: JointPreview, child: LoadedBody): ArrowPlacement | null {
  if (preview.origin === null || preview.axis === null) {
    return null;
  }
  const bounds = child.node.getHierarchyBoundingVectors(true);
  const extent = bounds.max.subtract(bounds.min).length();
  return placeJointArrow(preview.origin, preview.axis, extent);
}

export function createBodyHighlights(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  latestPose: LatestPose,
): BodyHighlights {
  const arrow = createJointArrow(scene);
  let selectedBodyIds: ReadonlySet<string> = new Set();
  let preview: JointPreview | null = null;
  // The arrow's origin and axis are relative to the parent body's pose: without
  // that pose it would be drawn in a place no body is.
  let parentPosed = false;

  const tintBodies = () => tintLoadedBodies(loadedBodies, selectedBodyIds, preview);
  const drawArrow = () => {
    const child = preview === null ? undefined : loadedBodies.get(preview.childBodyId);
    const placement =
      parentPosed && preview !== null && child ? arrowPlacement(preview, child) : null;
    if (placement === null || preview === null) {
      arrow.hide();
    } else {
      arrow.show(placement, preview.driven);
    }
  };

  return {
    setSelectedBodies: (bodyIds) => {
      selectedBodyIds = bodyIds;
      tintBodies();
    },
    setJointPreview: (next) => {
      if (next?.parentBodyId !== preview?.parentBodyId) {
        const known = next === null ? undefined : latestPose(next.parentBodyId);
        parentPosed = known !== undefined;
        if (known !== undefined) {
          arrow.follow(coreDisplacementToBabylon(known.translation, known.rotation));
        }
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
        if (!parentPosed) {
          parentPosed = true;
          drawArrow();
        }
        arrow.follow(coreDisplacementToBabylon(translation, rotation));
      }
    },
    forgetPoses: () => {
      parentPosed = false;
      drawArrow();
    },
  };
}
