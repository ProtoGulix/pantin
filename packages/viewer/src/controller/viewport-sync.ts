import { hiddenBodyIds } from "../assembly-display.ts";
import { assemblyFrameTargetOf } from "../assembly-frame.ts";
import { shouldRender } from "../central-layout.ts";
import { conveyorDrawingOf } from "../conveyors/conveyor-drawing.ts";
import { selectedConveyorKey } from "../conveyors/conveyor-selection.ts";
import type { createChainLinksCache } from "../diagram/diagram-chains.ts";
import { highlightedBodyIds } from "../diagram/diagram-selection.ts";
import { gizmoSpecOf } from "../gizmo/gizmo-spec.ts";
import { isPickingFaces, pickHighlightsOf } from "../joints/axis-pick.ts";
import { jointPreviewOf } from "../joints/joint-preview.ts";
import type { Viewport } from "../scene/viewport.ts";
import { sensorMarkersOf } from "../sensors/sensor-markers.ts";
import type { ViewerState } from "../viewer-state.ts";

/** Everything the 3D view shows besides the bodies and poses, drawn from the state. */
export function showViewportState(
  viewport: Viewport,
  next: ViewerState,
  chainLinksOf: ReturnType<typeof createChainLinksCache>,
): void {
  const document = next.openPantin?.document;
  viewport.setNavigation(next.navigation);
  viewport.setRendering(shouldRender(next.centralLayout, next.openPantin !== null));
  viewport.setSelectedBodies(
    document === undefined || next.openPantin === null
      ? new Set()
      : highlightedBodyIds(document, chainLinksOf(document), next.selection),
  );
  viewport.setHiddenBodies(
    document === undefined ? new Set() : hiddenBodyIds(document, next.assemblyDisplay),
  );
  viewport.showJointPreview(jointPreviewOf(next));
  viewport.showSensorMarkers(sensorMarkersOf(document));
  viewport.showConveyorObjects(conveyorDrawingOf(document));
  viewport.setSelectedConveyor(selectedConveyorKey(next.selection));
  viewport.showAssemblyFrame(assemblyFrameTargetOf(next));
  viewport.showPlacementGizmo(gizmoSpecOf(next));
  viewport.setAlignmentPicking(isPickingFaces(next));
  viewport.showFaceHighlights(pickHighlightsOf(next));
}
