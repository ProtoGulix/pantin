import type { BodyPose, ObjectPose, PantinDocument } from "@pantin/protocol";
import { bodyPoseTransforms, type Framed, framedWorldPose } from "./framed-world-pose.ts";
import { computePosedAssemblyFrames } from "./posed-assembly-frames.ts";
import { quantised } from "./product-poses.ts";
import type { RigidTransform } from "./rigid-transform.ts";

// World poses of the phase 6 objects as the pose response lists them (ADR 0043
// point 12), resolved by the same frame rule the physics step uses
// (framedWorldPose), so a client draws exactly where the collider, spawn volume
// or ray stands. Rounded like products, so a static object never counts as
// motion for the stream (ADR 0015). Order: belts, guides, emitters, absorbers,
// presence sensors, each in document order.

type Listed = { kind: ObjectPose["kind"]; id: string; frame: Framed };

function listedObjects(document: PantinDocument): Listed[] {
  const of = (kind: ObjectPose["kind"], items: readonly ({ id: string } & Framed)[]): Listed[] =>
    items.map((item) => ({ kind, id: item.id, frame: item }));
  return [
    ...of("belt", document.belts),
    ...of("guide", document.guides),
    ...of("emitter", document.emitters),
    ...of("absorber", document.absorbers),
    ...of("presenceSensor", document.presenceSensors),
  ];
}

// `bodies` and `displacements` are already computed for the same joint
// positions, so the kinematics runs once per response; the assembly frames are
// derived once here, and only when there is an object to place.
export function toObjectPoses(
  document: PantinDocument,
  bodies: readonly BodyPose[],
  displacements: ReadonlyMap<string, RigidTransform>,
): ObjectPose[] {
  const objects = listedObjects(document);
  if (objects.length === 0) {
    return [];
  }
  const assemblyFrames = computePosedAssemblyFrames(document, displacements);
  const bodyPoses = bodyPoseTransforms(bodies);
  return objects.map(({ kind, id, frame }) => {
    const { translation, rotation } = framedWorldPose(frame, assemblyFrames, bodyPoses);
    const [x, y, z] = translation;
    const [qx, qy, qz, qw] = rotation;
    return {
      kind,
      id,
      translation: [quantised(x), quantised(y), quantised(z)],
      rotation: [quantised(qx), quantised(qy), quantised(qz), quantised(qw)],
    };
  });
}
