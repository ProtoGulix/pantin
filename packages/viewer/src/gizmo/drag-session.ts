import { multiplyQuaternions } from "../frames.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import { placementOfGizmoNode } from "./anchor-frame.ts";
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
): DragSession {
  return {
    startPlacement,
    placementOf: (node, snap) => {
      const dragged = placementOfGizmoNode(anchor, startPlacement, node);
      if (kind === "move") {
        const [sx, sy, sz] = startPlacement.translation;
        const [dx, dy, dz] = snapTranslationDelta(
          [dragged.translation[0] - sx, dragged.translation[1] - sy, dragged.translation[2] - sz],
          snap ? steps.translationMillimetres : null,
        );
        return {
          translation: [sx + dx, sy + dy, sz + dz],
          rotation: startPlacement.rotation,
        };
      }
      const delta = snapRotationDelta(
        rotationBetween(startPlacement.rotation, dragged.rotation),
        snap ? steps.rotationDegrees : null,
      );
      return {
        translation: startPlacement.translation,
        rotation: multiplyQuaternions(delta, startPlacement.rotation),
      };
    },
  };
}
