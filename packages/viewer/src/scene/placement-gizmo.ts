import { PositionGizmo } from "@babylonjs/core/Gizmos/positionGizmo.js";
import { RotationGizmo } from "@babylonjs/core/Gizmos/rotationGizmo.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { babylonDisplacementToCore, coreDisplacementToBabylon } from "../frames.ts";
import { anchorFrameOf, gizmoNodeFrame, type PlacementGizmoSpec } from "../gizmo/anchor-frame.ts";
import { type DragSession, startDragSession } from "../gizmo/drag-session.ts";
import type { RigidTransform } from "../rigid-transform.ts";

// The Babylon.js side of the placement gizmo (ADR 0034 points 3, 4 and 7):
// thin on purpose. All frame arithmetic, rounding and Escape logic is in
// gizmo/, tested without a browser; this file attaches the gizmo to an
// invisible node and forwards what happens to it.
//
// The node sits at the assembly's displayed frame origin, turned like the
// anchor, and the gizmo follows the node's own axes, which are then the
// anchor's. While the user drags, the gizmo alone moves the node; the bodies
// move through the pose stream once the core has the placement.

export interface PlacementGizmoCallbacks {
  onDragged(assemblyKey: string, placement: RigidTransform): void;
  // Also after Escape: the caller reads the Pantin again, then calls release().
  onDragEnded(): void;
}

export interface PlacementGizmo {
  show(spec: PlacementGizmoSpec | null): void;
  /** The core's answer is in: the node may follow the assemblies again. */
  release(): void;
  /** Feeds the displayed pose of every body each frame; only the anchoring body's is kept. */
  followPose(
    bodyId: string,
    translation: readonly [number, number, number],
    rotation: readonly [number, number, number, number],
  ): void;
  forgetPoses(): void;
}

type ActiveGizmo = PositionGizmo | RotationGizmo;

export function createPlacementGizmo(
  scene: Scene,
  callbacks: PlacementGizmoCallbacks,
): PlacementGizmo {
  return new PlacementGizmoLayer(scene, callbacks);
}

class PlacementGizmoLayer implements PlacementGizmo {
  private readonly callbacks: PlacementGizmoCallbacks;
  private readonly layer: UtilityLayerRenderer;
  private readonly node: TransformNode;
  private spec: PlacementGizmoSpec | null = null;
  private gizmo: ActiveGizmo | null = null;
  private session: DragSession | null = null;
  // After a drag the node stays where the user left it until the Pantin is
  // read again: the poses already follow the new placement while the document
  // still holds the old one, which would put the frame in the wrong place.
  private held = false;
  private anchoringPose: { bodyId: string; pose: RigidTransform } | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.session !== null && this.spec !== null) {
      event.stopPropagation();
      this.callbacks.onDragged(this.spec.target.assemblyKey, this.session.startPlacement);
      // Ends the drag; the drag-end handler then closes the session.
      this.gizmo?.releaseDrag();
    }
  };

  constructor(scene: Scene, callbacks: PlacementGizmoCallbacks) {
    this.callbacks = callbacks;
    this.layer = new UtilityLayerRenderer(scene);
    this.node = new TransformNode("placement-gizmo-node", scene);
    this.node.rotationQuaternion = new Quaternion();
    scene.onBeforeRenderObservable.add(() => this.placeNode());
  }

  show(next: PlacementGizmoSpec | null): void {
    const previous = this.spec;
    const sameGizmo =
      next !== null &&
      previous !== null &&
      next.kind === previous.kind &&
      next.target.assemblyKey === previous.target.assemblyKey;
    if (!sameGizmo) {
      this.dispose();
    }
    this.spec = next;
    if (next !== null && this.gizmo === null) {
      this.gizmo = this.build(next.kind);
    }
  }

  release(): void {
    this.held = false;
  }

  followPose(
    bodyId: string,
    translation: readonly [number, number, number],
    rotation: readonly [number, number, number, number],
  ): void {
    if (this.spec?.target.anchoring?.bodyId === bodyId) {
      // Copied: the interpolator hands out the same arrays for every body.
      const [x, y, z] = translation;
      const [qx, qy, qz, qw] = rotation;
      this.anchoringPose = {
        bodyId,
        pose: { translation: [x, y, z], rotation: [qx, qy, qz, qw] },
      };
    }
  }

  forgetPoses(): void {
    this.anchoringPose = null;
  }

  private readonly poseOf = (bodyId: string): RigidTransform | undefined =>
    this.anchoringPose?.bodyId === bodyId ? this.anchoringPose.pose : undefined;

  private readNode(): RigidTransform {
    const { position } = this.node;
    const { x, y, z, w } = this.node.rotationQuaternion ?? Quaternion.Identity();
    return babylonDisplacementToCore([position.x, position.y, position.z], [x, y, z, w]);
  }

  private build(kind: PlacementGizmoSpec["kind"]): ActiveGizmo {
    const created = kind === "move" ? new PositionGizmo(this.layer) : new RotationGizmo(this.layer);
    created.onDragStartObservable.add(() => this.startDrag());
    created.onDragObservable.add((event) => this.drag(event.pointerInfo?.event.ctrlKey ?? false));
    created.onDragEndObservable.add(() => this.endDrag());
    return created;
  }

  private dispose(): void {
    // Ends a drag in progress (selection changed under it): the caller is told.
    this.gizmo?.releaseDrag();
    this.gizmo?.dispose();
    this.gizmo = null;
    this.held = false;
  }

  private startDrag(): void {
    if (this.spec === null) {
      return;
    }
    const anchor = anchorFrameOf(this.spec.target, this.poseOf);
    if (anchor === null) {
      return;
    }
    const { target, kind, steps } = this.spec;
    this.session = startDragSession(kind, anchor, target.placement, steps);
    document.addEventListener("keydown", this.onKeyDown, { capture: true });
  }

  // The node was moved by the gizmo just before this runs.
  private drag(ctrlKey: boolean): void {
    if (this.session !== null && this.spec !== null) {
      const placement = this.session.placementOf(this.readNode(), !ctrlKey);
      this.callbacks.onDragged(this.spec.target.assemblyKey, placement);
    }
  }

  private endDrag(): void {
    if (this.session === null) {
      return;
    }
    this.session = null;
    this.held = true;
    document.removeEventListener("keydown", this.onKeyDown, { capture: true });
    this.callbacks.onDragEnded();
  }

  private placeNode(): void {
    const { spec, gizmo, node } = this;
    if (spec === null || gizmo === null || this.session !== null || this.held) {
      return;
    }
    // F comes from the interpolated pose and the document's placement, which can
    // disagree for a frame or two after a re-read: rare and self-correcting.
    const anchor = anchorFrameOf(spec.target, this.poseOf);
    // The anchoring body has no pose yet: nothing to attach to.
    if (anchor === null) {
      gizmo.attachedNode = null;
      return;
    }
    const frame = gizmoNodeFrame(anchor, spec.target.placement);
    const babylon = coreDisplacementToBabylon(frame.translation, frame.rotation);
    node.position.set(...babylon.translation);
    node.rotationQuaternion?.set(...babylon.rotation);
    // Attached once, not every frame: attaching rebuilds the gizmo's state.
    if (gizmo.attachedNode !== node) {
      gizmo.attachedNode = node;
    }
  }
}
