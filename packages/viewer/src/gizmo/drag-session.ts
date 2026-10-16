import { multiplyQuaternions, type Vector3Tuple } from "../frames.ts";
import { conjugate, type RigidTransform, rotateVector } from "../rigid-transform.ts";
import { gizmoAxesRotation, placementOfGizmoNode } from "./anchor-frame.ts";
import type { GizmoSpace } from "./gizmo-space.ts";
import {
  type DragKind,
  rotationBetween,
  type SnapSteps,
  snapRotationDelta,
  snapTranslationDelta,
} from "./placement-snapping.ts";

// One drag of the gizmo, from its start to its end (ADR 0034 points 4, 5, 7).
// The anchor frame is frozen at the start: during the drag the bodies move
// under it (they follow the placements being sent), so a frame read again
// from the poses would drift away from the one the gizmo node lives in.
//
// What is sent is the start placement plus the SNAPPED DRAG: the distance
// along one anchor axis, or the angle about one. The half the drag does not
// touch is the start value itself, so noise never reaches it.

export interface DragSession {
  /** The placement to send for the node as the gizmo has put it; `snap` false when Ctrl is held. */
  placementOf(node: RigidTransform, snap: boolean): RigidTransform;
  /** What Escape sends: the placement the assembly had when the drag started. */
  readonly startPlacement: RigidTransform;
}

export function startDragSession(
  kind: DragKind,
  anchor: RigidTransform,
  startPlacement: RigidTransform,
  steps: SnapSteps,
  space: GizmoSpace,
): DragSession {
  // The gizmo's axes seen from the anchor; the drag is snapped along THEM.
  const axes = gizmoAxesRotation(startPlacement, space);
  const toAnchor = (vector: Vector3Tuple) => rotateVector(axes, vector);
  const toGizmo = (vector: Vector3Tuple) => rotateVector(conjugate(axes), vector);
  return {
    startPlacement,
    placementOf: (node, snap) => {
      const dragged = placementOfGizmoNode(anchor, startPlacement, node, space);
      if (kind === "move") {
        const [sx, sy, sz] = startPlacement.translation;
        const along = toGizmo([
          dragged.translation[0] - sx,
          dragged.translation[1] - sy,
          dragged.translation[2] - sz,
        ]);
        const [dx, dy, dz] = toAnchor(
          snapTranslationDelta(along, snap ? steps.translationMillimetres : null),
        );
        return {
          translation: [sx + dx, sy + dy, sz + dz],
          rotation: startPlacement.rotation,
        };
      }
      // The turn in the anchor frame, as a turn about the gizmo's own axes.
      const inAnchor = rotationBetween(startPlacement.rotation, dragged.rotation);
      const own = multiplyQuaternions(multiplyQuaternions(conjugate(axes), inAnchor), axes);
      const snapped = snapRotationDelta(own, snap ? steps.rotationDegrees : null);
      // Applied in the gizmo's axes: R0 . s in Local (the assembly's own turn),
      // s . R0 in Global; no conjugation, so no float noise reaches the document.
      const rotation =
        space === "local"
          ? multiplyQuaternions(startPlacement.rotation, snapped)
          : multiplyQuaternions(snapped, startPlacement.rotation);
      return { translation: startPlacement.translation, rotation };
    },
  };
}
