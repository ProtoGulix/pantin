import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import type { ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import { viewportPickOf } from "./alignment-pick.ts";
import { clickTargetOf } from "./click-target.ts";
import type { ViewportContext } from "./viewport-context.ts";

// What a click in the 3D view hits, split from viewport.ts.

/** The part of the viewport's callbacks that a click reaches. */
export interface PickCallbacks {
  onBodyPicked(bodyId: string | null, doubleClick: boolean): void;
  onConveyorPicked(kind: ConveyorKind, id: string): void;
  onAlignmentPick(pick: ViewportPick | null): void;
}

// A hidden body cannot be picked.
export function pickBody(context: ViewportContext, x: number, y: number) {
  const { scene, bodyIdByMesh } = context;
  return scene.pick(x, y, (mesh) => bodyIdByMesh.has(mesh) && mesh.isEnabled());
}

// One pass over bodies and phase 6 objects: the nearest hit wins.
function pickScene(context: ViewportContext, x: number, y: number) {
  const { scene, bodyIdByMesh, conveyors } = context;
  return scene.pick(
    x,
    y,
    (mesh) => mesh.isEnabled() && (bodyIdByMesh.has(mesh) || conveyors.keyOfMesh(mesh) !== null),
  );
}

export function listenToPicks(context: ViewportContext, callbacks: PickCallbacks): void {
  context.scene.onPointerObservable.add((pointerInfo) => {
    // A tap is a click without drag, so orbiting the camera never selects.
    const { type } = pointerInfo;
    if (type !== PointerEventTypes.POINTERTAP && type !== PointerEventTypes.POINTERDOUBLETAP) {
      return;
    }
    const { scene, bodyIdByMesh, conveyors } = context;
    if (context.alignmentPicking) {
      // A double click is a tap then a double tap: one pick, not two.
      if (type === PointerEventTypes.POINTERTAP) {
        const pick = pickBody(context, scene.pointerX, scene.pointerY);
        callbacks.onAlignmentPick(viewportPickOf(context, pick));
      }
      return;
    }
    const pick = pickScene(context, scene.pointerX, scene.pointerY);
    const target = clickTargetOf(
      pick.hit ? pick.pickedMesh : null,
      bodyIdByMesh,
      conveyors.keyOfMesh,
    );
    if (target.kind === "conveyor") {
      callbacks.onConveyorPicked(target.conveyor.kind, target.conveyor.id);
    } else {
      const bodyId = target.kind === "body" ? target.bodyId : null;
      callbacks.onBodyPicked(bodyId, type === PointerEventTypes.POINTERDOUBLETAP);
    }
  });
}
