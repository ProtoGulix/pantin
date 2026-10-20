import type { Viewport } from "./viewport.ts";

// Stands in for the 3D view when the browser cannot create a WebGL context
// (hardware acceleration off, GPU blocklisted, driver reset): the panels keep
// working and only the 3D view stays empty.
export function createInertViewport(): Viewport {
  const ignore = () => undefined;
  return {
    setAlignmentPicking: ignore,
    showFaceHighlights: ignore,
    showBodies: ignore,
    retryFailedBodies: ignore,
    setSelectedBodies: ignore,
    setHiddenBodies: ignore,
    frameBodies: ignore,
    pushPoses: ignore,
    clearPoses: ignore,
    showJointPreview: ignore,
    showSensorMarkers: ignore,
    showConveyorObjects: ignore,
    setSelectedConveyor: ignore,
    showTagStates: ignore,
    setRendering: ignore,
    showAssemblyFrame: ignore,
    showPlacementGizmo: ignore,
    releasePlacementGizmo: ignore,
    setNavigation: ignore,
    showView: ignore,
    previousView: ignore,
    onCameraOrientation: ignore,
    setScenePalette: ignore,
  };
}
