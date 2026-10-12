import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { ViewportContext } from "./viewport-context.ts";

// The displacement is set on the node just before drawing, so the frame shows
// the pose of this instant. The visitor is built once; each body still costs
// a few small tuples per frame.
export function applyPosesEachFrame(context: ViewportContext): void {
  const visit = (bodyId: string, pose: InterpolatedPose): void => {
    context.loadedBodies.get(bodyId)?.setDisplacement(pose.translation, pose.rotation);
    context.highlights.followPose(bodyId, pose.translation, pose.rotation);
    context.sensorMarkers.followPose(bodyId, pose.translation, pose.rotation);
    context.placementGizmo.followPose(bodyId, pose.translation, pose.rotation);
    context.assemblyTrihedron.followPose(bodyId, pose.translation, pose.rotation);
  };
  const visitProduct = (productId: string, pose: InterpolatedPose): void =>
    context.productMeshes.place(productId, pose);
  const visitObject = (key: string, pose: InterpolatedPose): void =>
    context.conveyors.place(key, pose);
  context.scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    context.poses.sample(now, visit);
    context.productPoses.sample(now, visitProduct);
    context.objectPoses.sample(now, visitObject);
  });
}

// Poses are forgotten only when the open Pantin changes or closes, and body
// keys include the Pantin id, so showBodies removes those bodies. They are NOT
// reset to the identity displacement: with placements (ADR 0033) their resting
// place is W . B, which the viewer does not compute. Overlays hide until poses
// arrive instead.
export function forgetPoses(context: ViewportContext): void {
  context.poses.reset();
  context.highlights.forgetPoses();
  context.sensorMarkers.forgetPoses();
  context.placementGizmo.forgetPoses();
  context.assemblyTrihedron.forgetPoses();
  context.conveyors.forgetPoses();
  context.productPoses.reset();
  context.objectPoses.reset();
  context.productMeshes.clear();
}
