import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { ScenePalette } from "../theme/scene-palette.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createJointArrow, type JointArrow } from "./joint-arrow.ts";
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
  /** The theme changed: the selection tint and the arrow colours follow it. */
  setPalette(palette: ScenePalette): void;
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
// --joint-child in base.css); the child is the body that moves, so it takes the
// selection colour. The parent's violet codes data, not the theme.
const PARENT_COLOR = Color3.FromHexString("#a371f7");

function highlightColor(highlight: BodyHighlight, selection: Color3): Color3 {
  return highlight === "parent" ? PARENT_COLOR : selection;
}

/** The latest pose of a body, if the stream gave one (the viewport's interpolator). */
export type LatestPose = (bodyId: string) => InterpolatedPose | undefined;

function tintLoadedBodies(
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  selectedBodyIds: ReadonlySet<string>,
  preview: JointPreview | null,
  selectionColor: Color3,
): void {
  for (const [bodyId, loaded] of loadedBodies) {
    const highlight = bodyHighlight(bodyId, selectedBodyIds, preview);
    for (const mesh of loaded.meshes) {
      mesh.renderOverlay = highlight !== null;
      mesh.overlayColor = highlightColor(highlight ?? "selected", selectionColor);
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

function drawJointArrow(
  arrow: JointArrow,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  preview: JointPreview | null,
  parentPosed: boolean,
): void {
  const child = preview === null ? undefined : loadedBodies.get(preview.childBodyId);
  const placement =
    parentPosed && preview !== null && child ? arrowPlacement(preview, child) : null;
  if (placement === null || preview === null) {
    arrow.hide();
  } else {
    arrow.show(placement, preview.driven);
  }
}

export function createBodyHighlights(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  latestPose: LatestPose,
  palette: ScenePalette,
): BodyHighlights {
  const arrow = createJointArrow(scene, palette);
  let selectionColor = Color3.FromHexString(palette.selection);
  let selectedBodyIds: ReadonlySet<string> = new Set();
  let preview: JointPreview | null = null;
  // The arrow's origin and axis are relative to the parent body's pose: without
  // that pose it would be drawn in a place no body is.
  let parentPosed = false;

  const tintBodies = () => tintLoadedBodies(loadedBodies, selectedBodyIds, preview, selectionColor);
  const drawArrow = () => drawJointArrow(arrow, loadedBodies, preview, parentPosed);

  return {
    setPalette: (next) => {
      selectionColor = Color3.FromHexString(next.selection);
      arrow.setPalette(next);
      tintBodies();
    },
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
