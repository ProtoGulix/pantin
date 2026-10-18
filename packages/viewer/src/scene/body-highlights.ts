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
  outlineWidthInMeshSpace,
  overlayAlphaFor,
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
// selection colour and an outline, the parent a yellow-orange tint alone: the
// two stay apart without telling hues.
interface Tints {
  selection: Color3;
  parent: Color3;
}

function tintsOf(palette: ScenePalette): Tints {
  return {
    selection: Color3.FromHexString(palette.selection),
    parent: Color3.FromHexString(palette.jointParent),
  };
}

function highlightColor(highlight: BodyHighlight, tints: Tints): Color3 {
  return highlight === "parent" ? tints.parent : tints.selection;
}

/** The latest pose of a body, if the stream gave one (the viewport's interpolator). */
export type LatestPose = (bodyId: string) => InterpolatedPose | undefined;

function paintBody(loaded: LoadedBody, highlight: BodyHighlight | null, tints: Tints): void {
  let extent = 0;
  if (highlight === "child") {
    const bounds = loaded.node.getHierarchyBoundingVectors(true);
    extent = bounds.max.subtract(bounds.min).length();
  }
  for (const mesh of loaded.meshes) {
    mesh.renderOverlay = highlight !== null;
    mesh.overlayColor = highlightColor(highlight ?? "selected", tints);
    mesh.overlayAlpha = overlayAlphaFor(highlight ?? "selected");
    mesh.renderOutline = highlight === "child";
    if (highlight === "child") {
      mesh.computeWorldMatrix(true);
      mesh.outlineColor = tints.selection;
      // Body nodes carry a uniform unit scale; abs guards against a mirrored GLB node.
      mesh.outlineWidth = outlineWidthInMeshSpace(extent, Math.abs(mesh.absoluteScaling.x));
    }
  }
}

function tintLoadedBodies(
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  selectedBodyIds: ReadonlySet<string>,
  preview: JointPreview | null,
  tints: Tints,
): void {
  for (const [bodyId, loaded] of loadedBodies) {
    paintBody(loaded, bodyHighlight(bodyId, selectedBodyIds, preview), tints);
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
  let tints = tintsOf(palette);
  let selectedBodyIds: ReadonlySet<string> = new Set();
  let preview: JointPreview | null = null;
  // The arrow's origin and axis are relative to the parent body's pose: without
  // that pose it would be drawn in a place no body is.
  let parentPosed = false;

  const tintBodies = () => tintLoadedBodies(loadedBodies, selectedBodyIds, preview, tints);
  const drawArrow = () => drawJointArrow(arrow, loadedBodies, preview, parentPosed);

  return {
    setPalette: (next) => {
      tints = tintsOf(next);
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
